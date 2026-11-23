# OMNI-MENTOR-001 — Verificação da Fase A1

## Assistente local

Na branch de desenvolvimento, execute `npm run dev`, faça login e abra **Conversar com a IA** na sidebar ou em [localhost](http://localhost:3000/dashboard/assistente). O robô da Dashboard abre o mesmo Assistente em uma janela. O botão de calendário abre um formulário para confirmar título e data antes de gravar.

Após criar uma conversa, troque de conta na mesma aba e confirme que o histórico da primeira conta sumiu do painel. A sessão atual determina qual histórico da aba pode ser aberto. A versão antiga gravava um histórico sem a identificação da conta, por isso ele fica fora da interface.

## Conferir a RPC no Supabase de desenvolvimento

O SQL abaixo lê somente metadados da função e dos privilégios efetivos. Use o SQL Editor do projeto descartável ou de desenvolvimento.

```sql
SELECT
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS argumentos,
  p.prosecdef AS security_definer,
  p.proconfig AS configuracao,
  pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_executa,
  pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_executa,
  pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE') AS public_executa
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'match_content_embeddings';
```

A comparação inicial usou a definição de [busca semântica versionada](../supabase/migrations/20250704163000_semantic_search.sql) em PostgreSQL 18 descartável. A instância usou um tipo e um operador de teste para simular a interface do pgvector. A conferência do catálogo e do controle de acesso ocorreu no PostgreSQL real. A função e os privilégios efetivos do Supabase implantado precisam da verificação acima.

Aplique manualmente a [migration corretiva](../supabase/migrations/20261124000002_lock_semantic_search.sql) em um ambiente de desenvolvimento com o schema de busca já instalado. Ela mantém a assinatura usada pelo aplicativo e rejeita assinaturas inesperadas ou sobrecargas. Depois de aplicar, espere `security_definer = false`, `anon_executa = false`, `public_executa = false` e `authenticated_executa = true`.

Em um Supabase descartável, com pgvector e as tabelas-base, execute [semantic_search_isolation.sql](../supabase/tests/semantic_search_isolation.sql) com `psql -X -v ON_ERROR_STOP=1`. O teste usa contas fictícias e encerra com `ROLLBACK`. Valide também a chamada via PostgREST com duas contas de teste e o fluxo normal em Busca semântica e Feynman.

## Pendências registradas

- Segurança do importador de PDF segue como tarefa prioritária independente antes da publicação.
- O roteamento e a migração de modelos ficam na Fase A2 após revisão.
- A integração do Assistente com Trilhas pertence à Fase B.
