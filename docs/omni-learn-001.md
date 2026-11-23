# OMNI-LEARN-001 — Teste local

## Abrir a trilha

Use um projeto Supabase de desenvolvimento com o motor de Questões e a coleção piloto já instalados. Confirme no painel que o SQL Editor e a aplicação local apontam para esse mesmo projeto de desenvolvimento. Aplique manualmente as migrations abaixo, nesta ordem.

1. [Motor de Trilhas](../supabase/migrations/20261124000000_learning_engine.sql)
2. [Trilha SQL — Concursos e Mercado](../supabase/migrations/20261124000001_learning_sql_pilot.sql)

Execute `npm run dev`, faça login e abra **Trilhas** no menu ou acesse [o catálogo local](http://localhost:3000/dashboard/trilhas). Inscreva-se, abra a primeira leitura e confirme. Em uma prática, responda uma questão e recarregue a página para verificar a retomada na questão seguinte.

A trilha registra a entrega do desafio como etapa cumprida e libera a avaliação final. O desafio tem resultado próprio, calculado somente após avaliação manual. A avaliação final mede desempenho nas dez questões da coleção e exige sete acertos na mesma rodada.

## Revisão manual

Uma conta revisora é configurada manualmente por quem administra o banco de desenvolvimento. Substitua o marcador pelo UUID Auth da conta autorizada no SQL Editor do projeto de desenvolvimento.

```sql
INSERT INTO learning_private.challenge_reviewers (user_id)
VALUES ('<uuid-da-conta-revisora>'::uuid)
ON CONFLICT (user_id) DO NOTHING;
```

Entre com essa conta e abra **Avaliar entregas** no roteiro. O revisor decide se cada critério foi atendido. A aprovação exige todos os critérios. Cada entrega recebe uma avaliação e a fila inclui até 50 entregas pendentes por desafio. A própria conta autora fica fora da fila do revisor.

## Testes em banco descartável

Em uma instância nova, aplique primeiro as duas migrations de [Questões](omni-quest-001a.md) e depois as duas de Trilhas. Execute `supabase/tests/quest_engine.sql` e `supabase/tests/learning_engine.sql` com `psql -X -v ON_ERROR_STOP=1`. Ambos usam identidades fictícias e encerram a transação com `ROLLBACK`.

O mesmo teste funciona em PostgreSQL descartável com o [bootstrap mínimo de Auth descrito em OMNI-QUEST-001A](omni-quest-001a.md#banco-descartável-com-supabase-local). Esse caminho cobre PostgreSQL e RLS. Para checar sessão JWT real e PostgREST, use uma stack Supabase de teste.

## Arte

A [capa de SQL](../public/images/trilhas/sql.webp) foi gerada com o ImageGen integrado e exportada em WebP. As ilustrações de missão usam artes locais do OmniMind.

> Create an original landscape 3:2 premium 3D cover illustration for OmniMind's SQL learning path, inspired only by the attached dark neon education dashboards: a large luminous electric-blue database cylinder made of three translucent glass tiers, with one small violet floating query tile with an abstract angle-bracket symbol and a subtle cyan grid of data points, hovering above a dim indigo platform. Blue and orchid rim lighting, faint violet dust and depth, restrained professional visual finish. Place the main object near the right-center, leave nearly black indigo (#100d21) on the outer edges and left so it can blend into the dark UI. No people, no lettering, no words, no screen frames, no dashboard, no duplicate cylinders. One clear iconographic composition readable at mobile width.
