import { Sparkles, Heart, Zap } from 'lucide-react'

export default function DesignShowcase() {
  return (
    <div className="mb-8 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-text-strong uppercase tracking-wider">Laboratório de Design (Comparação)</h2>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* Estilo 1: Linear / Vercel */}
        <div className="bg-[#0a0a0a] border border-indigo-500/20 shadow-[0_0_20px_rgba(79,70,229,0.15)] rounded-xl p-5 text-white relative overflow-hidden group transition-all hover:shadow-[0_0_30px_rgba(79,70,229,0.3)] hover:border-indigo-500/40 cursor-pointer">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <div className="flex items-center gap-3 mb-3 relative z-10">
            <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400 border border-indigo-500/20">
              <Sparkles className="size-4" />
            </div>
            <h3 className="font-medium text-[15px]">1. Linear / Cyber</h3>
          </div>
          <p className="text-sm text-slate-400 leading-relaxed relative z-10">
            Fundo escuro, bordas finas translúcidas, efeitos de luz (glow) e alto contraste neon. Ideal para foco absoluto.
          </p>
        </div>

        {/* Estilo 2: Bento Box / Apple */}
        <div className="bg-white dark:bg-slate-800 border-[1.5px] border-slate-200/80 dark:border-slate-700/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[24px] p-6 transition-all hover:-translate-y-1 hover:shadow-[0_12px_40px_rgb(0,0,0,0.08)] cursor-pointer">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 rounded-[14px]">
              <Heart className="size-5" />
            </div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">2. Bento Box / Apple</h3>
          </div>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
            Bordas super arredondadas, cores pastéis confortáveis, muito "ar" (padding) e sombras suaves. Fofo e fluido.
          </p>
        </div>

        {/* Estilo 3: Neobrutalismo */}
        <div className="bg-[#facc15] border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] rounded-xl p-5 text-black transition-all hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] cursor-pointer">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-black text-white rounded-md">
              <Zap className="size-5" />
            </div>
            <h3 className="font-black text-lg uppercase tracking-tight">3. Neobrutalismo</h3>
          </div>
          <p className="text-sm font-bold text-black/80 leading-relaxed">
            Estética anárquica e marcante. Cores chapadas, bordas hiper grossas e sombras sólidas off-set.
          </p>
        </div>

      </div>
    </div>
  )
}
