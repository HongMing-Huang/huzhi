"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import * as THREE from "three";
import Kanshan from "@/components/Kanshan";

gsap.registerPlugin(useGSAP);

/**
 * 身份星图：每个光点代表一次尚未揭晓的判断。
 * Three.js 只绘制一个低功耗场景；GSAP 负责 DOM 叙事与自动清理。
 */
export default function IdentityConstellation({ bank = 0 }: { bank?: number }) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useGSAP(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.dataset.reduceMotion === "1";
    gsap.from("[data-stage-copy]", {
      autoAlpha: 0,
      y: reduce ? 0 : 12,
      duration: reduce ? 0.01 : 0.55,
      stagger: reduce ? 0 : 0.07,
      ease: "power2.out",
    });
  }, { scope: root });

  useGSAP(() => {
    const target = canvas.current;
    if (!target) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.dataset.reduceMotion === "1";
    const renderer = new THREE.WebGLRenderer({ canvas: target, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 100);
    camera.position.z = 5.4;

    const geometry = new THREE.BufferGeometry();
    const count = 72;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const blue = new THREE.Color("#0066ff");
    const gold = new THREE.Color("#ffb547");
    for (let i = 0; i < count; i += 1) {
      const angle = i * 2.39996;
      const radius = 0.45 + Math.sqrt(i / count) * 1.65;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = Math.sin(angle) * radius * 0.68;
      positions[i * 3 + 2] = Math.sin(i * 0.83) * 0.55;
      const color = i % 5 === 0 ? gold : blue;
      colors.set([color.r, color.g, color.b], i * 3);
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({
      size: 0.075,
      transparent: true,
      opacity: 0.78,
      vertexColors: true,
      sizeAttenuation: true,
    }));
    scene.add(points);

    let frame = 0;
    let visible = true;
    const resize = () => {
      const rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
    };
    const draw = () => {
      if (visible && !reduce) {
        points.rotation.z += 0.0007;
        points.rotation.y += 0.0012;
      }
      renderer.render(scene, camera);
      frame = requestAnimationFrame(draw);
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    observer.observe(target);
    resize();
    draw();
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", resize);
      geometry.dispose();
      (points.material as THREE.Material).dispose();
      renderer.dispose();
    };
  }, { scope: root });

  return (
    <div ref={root} className="relative min-h-[218px] overflow-hidden rounded-[4px] bg-[linear-gradient(135deg,#071b3d,#082a59_58%,#074aa7)] text-white">
      <canvas ref={canvas} aria-hidden className="absolute inset-y-0 right-0 h-full w-[55%] opacity-90" />
      <div className="relative z-10 max-w-[62%] p-6 sm:p-7">
        <p data-stage-copy className="text-[12px] font-semibold tracking-[.18em] text-blue-200">HUZHI · 身份星图</p>
        <h2 data-stage-copy className="mt-2 text-[24px] font-semibold leading-tight">每一次判断，都在改变下一代 Agent</h2>
        <p data-stage-copy className="mt-2 max-w-md text-[13px] leading-6 text-blue-100/80">赚到的不是装饰币：用于下注、取证与挑战更难的伪装。当前可用 <b className="tnum text-white">{bank}</b> 积分。</p>
      </div>
      <Kanshan variant="idle" size={80} alt="刘看山守着身份星图" className="absolute bottom-1 right-3 z-10 sm:right-7" eager />
    </div>
  );
}
