'use client'

import { Layers, Hammer, Mountain, Gem } from 'lucide-react'
import { useMemo, useState, useEffect } from 'react'

interface StudyCompanionProps {
  streak: number
}

export default function StudyCompanion({ streak }: StudyCompanionProps) {
  // Define o estágio
  const stage = useMemo(() => {
    if (streak >= 10) return 'champion';     // Estágio 4: Ouro Maciço
    if (streak >= 4) return 'warrior';       // Estágio 3: Golem de Pedra
    if (streak >= 1) return 'initiate';      // Estágio 2: Iniciante
    return 'rubble';                         // Estágio 1: Escombros
  }, [streak]);

  // Mapeia o estágio para o Ícone e as classes Tailwind
  const config = useMemo(() => {
    switch (stage) {
      case 'rubble':
        return {
          Icon: Layers,
          className: 'size-12 text-zinc-700 opacity-40 scale-90 blur-[0.5px] transition-all duration-500'
        };
      case 'initiate':
        return {
          Icon: Hammer,
          className: 'size-12 text-zinc-300 border-2 border-zinc-500 rounded-xl p-1.5 shadow-sm shadow-zinc-500/20 transition-all duration-500'
        };
      case 'warrior':
        return {
          Icon: Mountain,
          className: 'size-12 text-emerald-400/90 drop-shadow-[0_0_10px_rgba(52,211,153,0.1)] transition-all duration-500'
        };
      case 'champion':
        return {
          Icon: Gem,
          className: 'size-12 text-amber-400 drop-shadow-[0_0_20px_rgba(245,158,11,0.8)] ring-2 ring-amber-500/50 rounded-full animate-pulse transition-all duration-500'
        };
    }
  }, [stage]);

  const Icon = config.Icon;

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
      {/* Ícone com Efeito Condicional de Upgrade e Brilho de Maestria */}
      <div className={`relative transition-all duration-500 
        ${isUpgrading ? 'animate-bounce scale-125 brightness-125' : ''}
        ${isMasteryGlowActive ? 'animate-pulse scale-110 brightness-125 drop-shadow-[0_0_20px_rgba(245,158,11,0.85)] ring-2 ring-amber-500/60 rounded-full' : ''}
      `}>
        {(isUpgrading || isMasteryGlowActive) && (
          <div className="absolute inset-0 rounded-full bg-amber-500/20 blur-xl animate-ping" />
        )}
        <div className={`${config.className}`}>
          <Icon className="size-full animate-in fade-in zoom-in-75 duration-300" strokeWidth={2} />
        </div>
      </div>
      
      {/* Texto de status (Aparece no hover) */}
      <div className="mt-2 text-[10px] font-bold uppercase tracking-wider text-text-muted opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-center">
        {stage === 'rubble' && 'Escombros (Streak 0)'}
        {stage === 'initiate' && 'Iniciante (Streak 1+)'}
        {stage === 'warrior' && 'Golem de Pedra (Streak 4+)'}
        {stage === 'champion' && 'Golem Dourado (Streak 10+)'}
      </div>
    </div>
  )
}
