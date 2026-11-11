// Pós-processamento: bloom, desfoques (profundidade de campo e movimento),
// grão de filme, vinheta e gradação de cor.
import * as THREE from '../../vendor/three.module.min.js';
import { fullscreenVert, downFrag, upFrag, composeFrag, cineComposeFrag, finalFrag } from './shaders.js';

// Alvos em meio-float quando o aparelho permite (mais faixa para o brilho das velas).
let RT_TYPE = THREE.HalfFloatType;

function rt(w, h, opts = {}) {
  return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type: RT_TYPE,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    ...opts,
  });
}

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    const ext = renderer.extensions;
    if (!ext.has('EXT_color_buffer_float') && !ext.has('EXT_color_buffer_half_float')) RT_TYPE = THREE.UnsignedByteType;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mat = (frag, uniforms) => new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: fullscreenVert, fragmentShader: frag, uniforms,
      depthTest: false, depthWrite: false,
    });
    this.down = mat(downFrag, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: -1 }, uKnee: { value: 0.18 } });
    this.compose = mat(composeFrag, { tA: { value: null }, tB: { value: null }, uMix: { value: 0 } });
    this.cineCompose = mat(cineComposeFrag, { tA: { value: null }, tB: { value: null }, uGate: { value: 0 }, uFade: { value: 0 } });
    this.up = mat(upFrag, { tSrc: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 } });
    this.final = mat(finalFrag, {
      tScene: { value: null }, tBloom: { value: null }, tBlur1: { value: null }, tBlur2: { value: null },
      uRes: { value: new THREE.Vector2() }, uTime: { value: 0 },
      uBloom: { value: 0.55 }, uExposure: { value: 1 }, uVignette: { value: 0.38 }, uGrain: { value: 0.045 },
      uVigScale: { value: 1 }, uVigCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uFoe: { value: new THREE.Vector2(0.5, 0.5) }, uMotion: { value: 0 },
      uFocus: { value: new THREE.Vector3(0.5, 0.5, 0.3) }, uDof: { value: 0 },
      uFade: { value: new THREE.Vector4(0, 0, 0, 0) },
      uSaturation: { value: 1 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uAberration: { value: 0.0012 },
    });
    this.levels = 5;
  }

  setSize(w, h) {
    this.w = w; this.h = h;
    this.dispose();
    const sceneOpts = { type: RT_TYPE, samples: this.samples ?? 4, depthBuffer: true, stencilBuffer: false };
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, sceneOpts);
    this.layerRT = new THREE.WebGLRenderTarget(w, h, sceneOpts);   // segunda vista, durante a travessia
    this.mixRT = rt(w, h);
    this.bloomDown = [];
    this.bloomUp = [];
    let bw = w, bh = h;
    for (let i = 0; i < this.levels; i++) {
      bw = Math.max(1, Math.floor(bw / 2)); bh = Math.max(1, Math.floor(bh / 2));
      this.bloomDown.push(rt(bw, bh));
      this.bloomUp.push(rt(bw, bh));
    }
    this.blur1 = rt(Math.floor(w / 2), Math.floor(h / 2));
    this.blur2 = rt(Math.floor(w / 4), Math.floor(h / 4));
    this.blur3 = rt(Math.floor(w / 8), Math.floor(h / 8));
    this.final.uniforms.uRes.value.set(w, h);
  }

  dispose() {
    const all = [this.sceneRT, this.layerRT, this.mixRT, this.blur1, this.blur2, this.blur3, ...(this.bloomDown || []), ...(this.bloomUp || [])];
    all.forEach((r) => r && r.dispose());
  }

  pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.cam);
  }

  downsample(src, dst, threshold = -1) {
    const u = this.down.uniforms;
    u.tSrc.value = src.texture;
    u.uTexel.value.set(1 / src.width, 1 / src.height);
    u.uThreshold.value = threshold;
    this.pass(this.down, dst);
  }

  // Funde sceneRT (vista A) e layerRT (vista B) em mixRT.
  blend(mix) {
    const u = this.compose.uniforms;
    u.tA.value = this.sceneRT.texture;
    u.tB.value = this.layerRT.texture;
    u.uMix.value = mix;
    this.pass(this.compose, this.mixRT);
    return this.mixRT;
  }

  // Passeio em cenas: B pela abertura de A (gate) e no lugar de A (fade).
  cineBlend(gate, fade) {
    const u = this.cineCompose.uniforms;
    u.tA.value = this.sceneRT.texture;
    u.tB.value = this.layerRT.texture;
    u.uGate.value = gate;
    u.uFade.value = fade;
    this.pass(this.cineCompose, this.mixRT);
    return this.mixRT;
  }

  render(params) {
    const sceneRT = params.source || this.sceneRT;
    // Bloom
    this.downsample(sceneRT, this.bloomDown[0], params.bloomThreshold ?? 0.75);
    for (let i = 1; i < this.levels; i++) this.downsample(this.bloomDown[i - 1], this.bloomDown[i]);
    const up = this.up.uniforms;
    let prev = this.bloomDown[this.levels - 1];
    for (let i = this.levels - 2; i >= 0; i--) {
      up.tSrc.value = prev.texture;
      up.tBase.value = this.bloomDown[i].texture;
      up.uTexel.value.set(1 / prev.width, 1 / prev.height);
      this.pass(this.up, this.bloomUp[i]);
      prev = this.bloomUp[i];
    }
    // Desfoque para profundidade de campo (só quando necessário)
    const f = this.final.uniforms;
    if (params.dof > 0.001) {
      this.downsample(sceneRT, this.blur1);
      this.downsample(this.blur1, this.blur2);
      this.downsample(this.blur2, this.blur3);
      f.tBlur1.value = this.blur2.texture;
      f.tBlur2.value = this.blur3.texture;
    }
    f.tScene.value = sceneRT.texture;
    f.tBloom.value = this.bloomUp[0].texture;
    f.uTime.value = params.time;
    f.uBloom.value = params.bloom;
    f.uExposure.value = params.exposure;
    f.uVignette.value = params.vignette;
    f.uVigScale.value = params.vigScale ?? 1;
    if (params.vigCenter) f.uVigCenter.value.copy(params.vigCenter);
    f.uGrain.value = params.grain;
    f.uMotion.value = params.motion;
    f.uFoe.value.copy(params.foe);
    f.uFocus.value.copy(params.focus);
    f.uDof.value = params.dof;
    f.uFade.value.copy(params.fade);
    f.uSaturation.value = params.saturation;
    f.uTint.value.copy(params.tint);
    this.pass(this.final, null);
  }
}
