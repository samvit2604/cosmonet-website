import * as T from '/assets/vendor/three.module.min.js';

// Bloom is applied to the light buffer only. The original geometry stays sharp.
export function createCloudBloom(renderer) {
  const type=renderer.extensions.has('EXT_color_buffer_float')?T.HalfFloatType:T.UnsignedByteType;
  const target=(depth=false)=>new T.WebGLRenderTarget(1,1,{type,minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:depth,stencilBuffer:false});
  const image=target(true),bright=target(),horizontal=target(),vertical=target();
  image.samples=Math.min(4,renderer.capabilities.maxSamples);
  const camera=new T.OrthographicCamera(-1,1,1,-1,0,1),scene=new T.Scene();
  const vertexShader='varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}';
  const material=(uniforms,fragmentShader)=>new T.ShaderMaterial({uniforms,vertexShader,fragmentShader,depthTest:false,depthWrite:false,toneMapped:false,blending:T.NoBlending});
  const extract=material({source:{value:image.texture}},`
    varying vec2 vUv; uniform sampler2D source;
    void main(){vec3 c=texture2D(source,vUv).rgb;float b=max(c.r,max(c.g,c.b));
      float amount=smoothstep(.9,1.8,b);gl_FragColor=vec4(c*amount,1.0);}`);
  const blur=material({source:{value:bright.texture},direction:{value:new T.Vector2()}},`
    varying vec2 vUv;uniform sampler2D source;uniform vec2 direction;
    void main(){vec3 c=texture2D(source,vUv).rgb*.227027;
      c+=(texture2D(source,vUv+direction*1.384615).rgb+texture2D(source,vUv-direction*1.384615).rgb)*.316216;
      c+=(texture2D(source,vUv+direction*3.230769).rgb+texture2D(source,vUv-direction*3.230769).rgb)*.070270;
      gl_FragColor=vec4(c,1.0);}`);
  const compose=material({source:{value:image.texture},glow:{value:vertical.texture},strength:{value:.42}},`
    varying vec2 vUv;uniform sampler2D source;uniform sampler2D glow;uniform float strength;
    vec3 display(vec3 c){c*=1.08;c=clamp((c*(2.51*c+.03))/(c*(2.43*c+.59)+.14),0.0,1.0);
      return mix(c*12.92,1.055*pow(c,vec3(1.0/2.4))-.055,step(vec3(.0031308),c));}
    void main(){vec4 base=texture2D(source,vUv);vec3 bloom=texture2D(glow,vUv).rgb*strength;
      float alpha=max(base.a,clamp(max(bloom.r,max(bloom.g,bloom.b))*.65,0.0,.85));
      gl_FragColor=vec4(display(base.rgb+bloom)*alpha,alpha);}`);
  const quad=new T.Mesh(new T.PlaneGeometry(2,2),extract);scene.add(quad);
  let width=1,height=1,bw=1,bh=1;
  function resize(){const size=renderer.getDrawingBufferSize(new T.Vector2());if(size.x===width&&size.y===height)return;
    width=size.x;height=size.y;bw=Math.max(1,Math.round(width/2));bh=Math.max(1,Math.round(height/2));
    image.setSize(width,height);for(const t of [bright,horizontal,vertical])t.setSize(bw,bh);
  }
  function pass(shader,target){quad.material=shader;renderer.setRenderTarget(target);renderer.render(scene,camera);}
  function render(content,view){resize();renderer.setRenderTarget(image);renderer.clear();renderer.render(content,view);
    pass(extract,bright);blur.uniforms.source.value=bright.texture;blur.uniforms.direction.value.set(2.2/bw,0);pass(blur,horizontal);
    blur.uniforms.source.value=horizontal.texture;blur.uniforms.direction.value.set(0,2.2/bh);pass(blur,vertical);pass(compose,null);
  }
  return {render};
}
