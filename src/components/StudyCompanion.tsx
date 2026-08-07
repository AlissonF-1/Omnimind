'use client'

import { useMemo, useState, useEffect } from 'react'
import Image from 'next/image'

interface StudyCompanionProps {
  streak: number
}

export default function StudyCompanion({ streak }: StudyCompanionProps) {
  // Define o estágio do Golem com 5 níveis 3D
  const stage = useMemo(() => {
    if (streak >= 30) return 'magma';       // Estágio 5: Golem de Magma Lendário (Streak 30+)
    if (streak >= 10) return 'champion';    // Estágio 4: Golem Dourado Celestial (Streak 10+)
    if (streak >= 4) return 'warrior';      // Estágio 3: Golem de Obsidiana & Néon (Streak 4+)
    if (streak >= 1) return 'initiate';     // Estágio 2: Golem de Sílex (Streak 1+)
    return 'rubble';                        // Estágio 1: Ovo de Pedra Adormecido (Streak 0)
  }, [streak]);

  // Configuração visual de cada estágio
  const config = useMemo(() => {
    switch (stage) {
      case 'rubble':
        return {
          name: 'Ovo Adormecido',
          label: 'Ovo de Pedra (Streak 0)',
          image: '/images/golem_stage1.png',
          glowClass: 'shadow-[0_0_15px_rgba(156,163,175,0.2)] border-zinc-700/40',
          badgeClass: 'bg-zinc-800/80 text-zinc-400 border-zinc-700/50'
        };
      case 'initiate':
        return {
          name: 'Golem de Sílex',
          label: 'Golem Iniciante (Streak 1+)',
          image: '/images/golem_stage2.png',
          glowClass: 'shadow-[0_0_20px_rgba(59,130,246,0.3)] border-blue-500/40',
          badgeClass: 'bg-blue-950/80 text-blue-300 border-blue-500/40'
        };
      case 'warrior':
        return {
          name: 'Golem de Obsidiana',
          label: 'Golem de Néon (Streak 4+)',
          image: '/images/golem_stage3.png',
          glowClass: 'shadow-[0_0_25px_rgba(168,85,247,0.4)] border-purple-500/40',
          badgeClass: 'bg-purple-950/80 text-purple-300 border-purple-500/40'
        };
      case 'champion':
        return {
          name: 'Golem Dourado',
          label: 'Golem Celestial (Streak 10+)',
          image: '/images/golem_stage4.png',
          glowClass: 'shadow-[0_0_30px_rgba(245,158,11,0.6)] border-amber-500/50 ring-2 ring-amber-500/30',
          badgeClass: 'bg-amber-950/90 text-amber-300 border-amber-500/50'
        };
      case 'magma':
        return {
          name: 'Golem de Magma',
          label: 'Golem Lendário (Streak 30+)',
          image: '/images/golem_stage5.png',
          glowClass: 'shadow-[0_0_35px_rgba(239,68,68,0.8)] border-red-500/60 ring-2 ring-red-500/40 animate-pulse',
          badgeClass: 'bg-red-950/90 text-red-300 border-red-500/60 font-black'
        };
    }
  }, [stage]);

  // Animação de transição/upgrade
  const [prevStage, setPrevStage] = useState(stage);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [isMasteryGlowActive, setIsMasteryGlowActive] = useState(false);

  useEffect(() => {
    if (stage !== prevStage) {
      setIsUpgrading(true);
      const timer = setTimeout(() => {
        setIsUpgrading(false);
        setPrevStage(stage);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [stage, prevStage]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hasGlow = localStorage.getItem('omnimind_mastery_combo_glow');
      if (hasGlow === 'true') {
        setIsMasteryGlowActive(true);
        localStorage.removeItem('omnimind_mastery_combo_glow');
        const timer = setTimeout(() => {
          setIsMasteryGlowActive(false);
        }, 5000);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  return (
    <div className="relative flex flex-col items-center justify-center group select-none">
      {/* Contêiner da Imagem 3D com Efeito de Brilho */}
      <div className={`relative size-14 sm:size-16 rounded-2xl overflow-hidden border p-0.5 transition-all duration-500 bg-surface/80 backdrop-blur-sm ${config.glowClass}
        ${isUpgrading ? 'animate-bounce scale-125 brightness-125' : 'hover:scale-105'}
        ${isMasteryGlowActive ? 'animate-pulse scale-110 brightness-125 drop-shadow-[0_0_25px_rgba(245,158,11,0.85)]' : ''}
      `}>
        {(isUpgrading || isMasteryGlowActive) && (
          <div className="absolute inset-0 rounded-2xl bg-amber-500/30 blur-xl animate-ping pointer-events-none" />
        )}
        
        <div className="relative size-full rounded-xl overflow-hidden">
          <Image
            src={config.image}
            alt={config.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-110"
            priority
          />
        </div>
      </div>
      
      {/* Badge de status no hover */}
      <div className="absolute top-full mt-2 z-30 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-1 group-hover:translate-y-0 whitespace-nowrap">
        <div className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border shadow-lg backdrop-blur-md ${config.badgeClass}`}>
          {config.label}
        </div>
      </div>
    </div>
  )
}
