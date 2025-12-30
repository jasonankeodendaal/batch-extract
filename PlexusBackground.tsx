
import React, { useEffect, useRef } from 'react';

interface PlexusBackgroundProps {
  isProcessing?: boolean;
}

const PlexusBackground: React.FC<PlexusBackgroundProps> = ({ isProcessing = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let particles: Particle[] = [];
    const particleCount = Math.min(window.innerWidth / 18, 100);
    const connectionDistance = 180;
    const mouseForce = 150;

    class Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;

      constructor() {
        this.x = Math.random() * canvas!.width;
        this.y = Math.random() * canvas!.height;
        this.vx = (Math.random() - 0.5) * (isProcessing ? 3.0 : 0.4);
        this.vy = (Math.random() - 0.5) * (isProcessing ? 3.0 : 0.4);
        this.size = Math.random() * 1.5 + 0.5;
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;

        if (this.x < 0 || this.x > canvas!.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvas!.height) this.vy *= -1;

        if (mouseRef.current.active) {
          const dx = this.x - mouseRef.current.x;
          const dy = this.y - mouseRef.current.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < mouseForce) {
            const force = (mouseForce - distance) / mouseForce;
            this.vx += (dx / distance) * force * 0.15;
            this.vy += (dy / distance) * force * 0.15;
          }
        }

        const maxVel = isProcessing ? 5 : 1.2;
        const currentVel = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (currentVel > maxVel) {
          this.vx = (this.vx / currentVel) * maxVel;
          this.vy = (this.vy / currentVel) * maxVel;
        }
      }

      draw() {
        if (!ctx) return;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = isProcessing ? 'rgba(52, 211, 153, 0.5)' : 'rgba(59, 130, 246, 0.3)';
        ctx.fill();
      }
    }

    const init = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      particles = [];
      for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];
        p1.update();
        p1.draw();

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < connectionDistance) {
            ctx.beginPath();
            const opacity = (isProcessing ? 0.25 : 0.08) * (1 - distance / connectionDistance);
            ctx.strokeStyle = isProcessing ? `rgba(52, 211, 153, ${opacity})` : `rgba(59, 130, 246, ${opacity})`;
            ctx.lineWidth = isProcessing ? 1.2 : 0.8;
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      }
      animationFrameId = requestAnimationFrame(animate);
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY, active: true };
    };

    const handleResize = () => {
      init();
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);

    init();
    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isProcessing]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 bg-[#020305]"
      style={{ opacity: 0.7 }}
    />
  );
};

export default PlexusBackground;
