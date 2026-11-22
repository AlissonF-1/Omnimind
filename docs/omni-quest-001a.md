# OMNI-QUEST-001A — Validação do motor de questões

## Contrato para a interface

Use o cliente Supabase da sessão para ler `quest_competencies`, `quest_question_versions`, `quest_question_options` e as próprias linhas de `quest_attempts`. No catálogo, escolha a maior versão de cada `question_id`. Na resolução, mantenha o `versionId` exibido e suas opções até o fim da tentativa. Ao reabrir o histórico, consulte a versão registrada na tentativa.

Chame `submitQuestionAnswer({ versionId, optionId, requestId })` ao confirmar a escolha. Gere `requestId` antes do primeiro envio e preserve-o junto da escolha durante retentativas, inclusive se a resposta de rede for perdida. Uma nova resolução intencional precisa de outro identificador. `getQuestionAttemptFeedback(attemptId)` recupera a correção persistida do titular. Renderize as explicações somente a partir do retorno dessas ações.

A função de correção usa a identidade da sessão, valida a alternativa na versão indicada e calcula o resultado no PostgreSQL. A constraint `UNIQUE (user_id, request_id)` arbitra gravações simultâneas. O reenvio idêntico devolve a linha original, e a reutilização da chave com outra resposta é rejeitada. O catálogo guarda somente os campos de leitura. Gabarito e explicações ficam em `quest_private`.

## Verificações da aplicação

Na raiz do repositório, com Node 24 e as dependências do OmniMind disponíveis:

```powershell
node --test tests/questions/contracts.test.mjs
node .\node_modules\typescript\bin\tsc --noEmit --incremental false --pretty false
node .\node_modules\eslint\bin\eslint.js --no-cache src/actions/questions.ts src/lib/questions/contracts.ts tests/questions/contracts.test.mjs
```

## Banco descartável com Supabase local

Use Supabase CLI, Docker compatível e uma pasta nova e desvinculada de qualquer projeto hospedado. Copie para `supabase/migrations` dessa pasta apenas `20261120000000_quest_engine.sql` e `20261120000001_quest_sql_pilot.sql`, nesta ordem. Essa seleção evita depender do DDL-base ausente nas migrations antigas do OmniMind. Copie `supabase/tests/quest_engine.sql` para a pasta de testes. [Fluxo local do Supabase](https://supabase.com/docs/guides/local-development/cli/getting-started)

1. Execute `supabase init` na pasta descartável. Configure um `project_id` exclusivo, por exemplo `omni-quest-check`, e portas livres para a stack local.
2. Execute `supabase start *> $null` no PowerShell e confira o código de saída. O Supabase aplica as duas migrations na primeira inicialização. [Comandos locais do Supabase](https://supabase.com/docs/guides/local-development/cli-workflows)
3. Identifique o contêiner PostgreSQL pelo `project_id` da pasta descartável em `docker ps`. Para o exemplo acima, execute os comandos abaixo desse mesmo diretório, depois de confirmar o nome do contêiner.

```powershell
docker cp .\supabase\tests\quest_engine.sql supabase_db_omni-quest-check:/tmp/quest_engine.sql
docker exec supabase_db_omni-quest-check psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f /tmp/quest_engine.sql
```

O script usa duas contas fictícias dentro de uma transação com `ROLLBACK`. Deve terminar com `Motor de questões: testes de integração passaram.` e código de saída zero. Valida também a carga de seis competências, dez questões, cinquenta alternativas e dez gabaritos. No Supabase local completo, confirme adicionalmente pelo Data API que `authenticated` consegue ler o catálogo e que a chamada de correção segue as mesmas regras usando uma sessão real.

Para validar a camada SQL em PostgreSQL descartável sem Supabase, prepare primeiro os papéis `anon` e `authenticated`, uma tabela de teste `auth.users(id uuid PRIMARY KEY, aud text, role text, email text)` e uma função `auth.uid()` que leia o `sub` de `request.jwt.claim.sub` ou `request.jwt.claims`. Conceda `USAGE` em `auth` e `public` aos dois papéis. Em seguida aplique as duas migrations e rode o mesmo script com `psql -v ON_ERROR_STOP=1`. Essa opção cobre funções, constraints e RLS do PostgreSQL. Supabase Auth, PostgREST e a sessão Next.js precisam da validação na stack completa.

## Exercício reservado — idempotência

Acrescente um bloco à suíte SQL, usando o contexto autenticado de Alice. Envie uma alternativa com um `request_id` novo, guarde o ID da tentativa retornada e tente enviar outra alternativa válida da mesma versão com o mesmo `request_id`. Capture `unique_violation` (`23505`) somente ao redor do segundo envio. Por fim, consulte `quest_attempts` e verifique que há uma única linha para a chave e que seu ID, alternativa e resultado são os do primeiro envio.

A restrição de unicidade limita o número de linhas. A comparação de versão e alternativa decide se a segunda chamada é uma repetição fiel ou uma tentativa de mudar a operação já registrada.
