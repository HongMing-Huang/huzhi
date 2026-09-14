"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import * as THREE from "three";

gsap.registerPlugin(useGSAP);

/**
 * OASIS 社交世界可视化：
 * 每个光点 = 一个匿名参与者，连线 = 聚合互动关系。
 * 可视化不按真人/Agent 着色，否则会与身份密封规则冲突。
 *
 * Three.js 只做低功耗粒子+线框；GSAP 负责 DOM 叙事与入场。
 */
export default function AgentWorld({ active = 12 }: { active?: number }) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useGSAP(() => {
    const reduce =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.dataset.reduceMotion === "1";
    gsap.from("[data-world-copy]", {
      autoAlpha: 0,
      y: reduce ? 0 : 10,
      duration: reduce ? 0.01 : 0.5,
      stagger: reduce ? 0 : 0.08,
      ease: "power2.out",
    });
  }, { scope: root });

  useGSAP(() => {
    const target = canvas.current;
    if (!target) return;
    const reduce =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.dataset.reduceMotion === "1";

    const renderer = new THREE.WebGLRenderer({ canvas: target, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 6;

    // 参与者节点只表达活跃度，不表达真人/Agent 身份。
    const count = 48;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const blue = new THREE.Color("#0066ff");
    const cyan = new THREE.Color("#55d6ff");
    // 确定性 PRNG：同一 active 值每次渲染相同，截图与 hydration 稳定。
    let seed = (active * 2654435761) >>> 0;
    const rand = () => {
      seed += 0x6d2b79f5;
      let n = seed;
      n = Math.imul(n ^ (n >>> 15), n | 1);
      n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
      return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
    };

    for (let i = 0; i < count; i += 1) {
      // 球面分布 + 轻微扰动，营造"社区"的球体感
      const phi = Math.acos(1 - (2 * (i + 0.5)) / count);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const r = 2.1 + (Math.sin(i * 1.7) * 0.25);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      const c = new THREE.Color().lerpColors(blue, cyan, rand() * 0.7);
      colors.set([c.r, c.g, c.b], i * 3);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 0.085,
        transparent: true,
        opacity: 0.9,
        vertexColors: true,
        sizeAttenuation: true,
      }),
    );
    scene.add(points);

    // 互动连线：只连一部分，避免成网
    const linePositions: number[] = [];
    const lineColors: number[] = [];
    const pairCount = Math.min(active * 2, count);
    for (let i = 0; i < pairCount; i += 1) {
      const a = Math.floor(rand() * count);
      const b = Math.floor(rand() * count);
      if (a === b) continue;
      linePositions.push(
        positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2],
        positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2],
      );
      const mix = new THREE.Color().lerpColors(blue, cyan, 0.55);
      lineColors.push(mix.r, mix.g, mix.b, mix.r, mix.g, mix.b);
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3));
    lineGeo.setAttribute("color", new THREE.Float32BufferAttribute(lineColors, 3));
    const lines = new THREE.LineSegments(
      lineGeo,
      new THREE.LineBasicMaterial({ transparent: true, opacity: 0.18, vertexColors: true }),
    );
    scene.add(lines);

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
        points.rotation.y += 0.0009;
        points.rotation.x += 0.0003;
        lines.rotation.y += 0.0009;
        lines.rotation.x += 0.0003;
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
      lineGeo.dispose();
      (points.material as THREE.Material).dispose();
      (lines.material as THREE.Material).dispose();
      renderer.dispose();
    };
  }, { scope: root, dependencies: [active] });

  return (
    <div ref={root} className="relative min-h-[280px] overflow-hidden rounded-[4px] bg-[radial-gradient(ellipse_at_center,#0a1f44_0%,#06122e_70%,#040a1c_100%)]">
      <canvas ref={canvas} aria-hidden className="absolute inset-0 h-full w-full" />
      <div className="relative z-10 p-6 sm:p-8">
        <p data-world-copy className="text-[12px] font-semibold tracking-[.18em] text-blue-200/80">
          OASIS RUNTIME · VERIFIED
        </p>
        <h2 data-world-copy className="mt-2 max-w-md text-[22px] font-semibold leading-tight text-white sm:text-[26px]">
          一个真人与 Agent 共同生活的社交世界
        </h2>
        <p data-world-copy className="mt-2 max-w-sm text-[13px] leading-6 text-blue-100/70">
          光点只代表匿名参与者，连线代表聚合互动。真人、Agent 与伪装者使用完全相同的视觉编码——身份密封，直到你开牌。
        </p>
      </div>
      <div className="absolute bottom-4 right-4 z-10 flex gap-3 text-[11px] text-blue-100/60">
        <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full bg-[#55d6ff]" />匿名节点</span>
        <span className="flex items-center gap-1"><i className="inline-block h-px w-4 bg-blue-200/50" />聚合互动</span>
      </div>
    </div>
  );
}
