DO $pilot$
DECLARE
  sql_path uuid;
  question record;
  pinned_version uuid;
  practice_step uuid;
  assessment_step uuid;
  practice_position integer;
BEGIN
  INSERT INTO public.learning_paths (slug, kind, title, description)
  VALUES ('sql-concursos-e-mercado', 'concurso', 'SQL — Concursos e Mercado',
    'Aprenda a filtrar, cruzar e agregar dados. Pratique com questões de concurso e entregue uma consulta para um cenário de trabalho.')
  RETURNING id INTO sql_path;

  INSERT INTO public.learning_path_steps (path_id, position, topic, kind, title, body) VALUES
  (sql_path, 1, 'select-where', 'reading', 'SELECT e WHERE', $lesson$
## Projete colunas, filtre linhas

**SELECT** escolhe as colunas que vão aparecer no resultado. **FROM** aponta para a tabela. **WHERE** decide quais linhas entram.

    SELECT titulo, nota
    FROM cursos
    WHERE nota >= 7;

- Uma nota igual a 7 entra no resultado.
- Uma nota menor que 7 fica de fora.
- A consulta lê os dados. O filtro pode usar uma coluna mesmo quando ela não aparece no SELECT.

**Antes de avançar:** explique qual parte mudaria para mostrar apenas o título, mantendo o mesmo filtro.
$lesson$),
  (sql_path, 3, 'and-or', 'reading', 'AND e OR', $lesson$
## Agrupe condições com intenção

**AND** exige que as duas condições sejam verdadeiras. **OR** basta com uma. Sem parênteses, AND tem precedência sobre OR.

    SELECT nome
    FROM inscricoes
    WHERE ativo = true
      AND (turno = 'manha' OR turno = 'noite');

O filtro exige inscrição ativa nos dois turnos. Tire os parênteses mentalmente e veja por que uma inscrição inativa da noite passaria.

**Antes de avançar:** escreva em português as condições da consulta, respeitando os grupos.
$lesson$),
  (sql_path, 5, 'join', 'reading', 'JOIN', $lesson$
## Relacione tabelas por chaves

**INNER JOIN** exige correspondência nos dois lados. **LEFT JOIN** preserva as linhas do lado esquerdo. Quando não há correspondência, as colunas do lado direito aparecem como NULL.

    SELECT c.nome, i.id
    FROM cursos AS c
    LEFT JOIN inscricoes AS i ON i.curso_id = c.id;

Cada inscrição correspondente cria uma linha no resultado. Um curso com três inscrições aparece três vezes. Um curso sem inscrições ainda aparece, com i.id nulo. Um filtro de igualdade sobre uma coluna de i no WHERE pode excluir essa última linha.

**Antes de avançar:** nomeie a tabela que o LEFT JOIN preserva e a chave usada para juntar os dados.
$lesson$),
  (sql_path, 7, 'group-having', 'reading', 'GROUP BY e HAVING', $lesson$
## Filtre linhas e depois filtre grupos

**WHERE** filtra linhas antes de agrupar. **GROUP BY** reúne linhas com o mesmo valor de agrupamento. **HAVING** seleciona grupos depois que a agregação é calculada.

    SELECT cargo, COUNT(*) AS aprovados
    FROM candidaturas
    WHERE resultado = 'aprovado'
    GROUP BY cargo
    HAVING COUNT(*) >= 3;

O resultado mostra apenas cargos com pelo menos três aprovados. Uma linha reprovada é removida pelo WHERE antes de contribuir para o grupo.

**Antes de avançar:** identifique onde você mudaria a quantidade mínima de aprovados.
$lesson$),
  (sql_path, 9, 'count-null', 'reading', 'COUNT e NULL', $lesson$
## Conte linhas ou valores presentes

**COUNT(*)** conta linhas. **COUNT(coluna)** conta linhas em que essa coluna tem valor. Use **IS NULL** ou **IS NOT NULL** para testar a presença de valor.

    SELECT COUNT(*) AS inscricoes,
           COUNT(nota) AS notas_publicadas
    FROM inscricoes;

Se houver três inscrições com notas 8, 0 e NULL, as contagens serão 3 e 2. Zero é um valor e entra na segunda contagem.

**Antes de avançar:** explique por que nota = NULL não seleciona inscrições pendentes.
$lesson$);

  INSERT INTO public.learning_path_steps (path_id, position, topic, kind, title) VALUES
    (sql_path, 2, 'select-where', 'practice', 'Prática de filtros e projeções'),
    (sql_path, 4, 'and-or', 'practice', 'Prática de condições compostas'),
    (sql_path, 6, 'join', 'practice', 'Prática de relacionamento entre tabelas'),
    (sql_path, 8, 'group-having', 'practice', 'Prática de agrupamento e filtros'),
    (sql_path, 10, 'count-null', 'practice', 'Prática de contagem e valores nulos');

  INSERT INTO public.learning_path_steps (path_id, position, topic, kind, title, body, rubric)
  VALUES (sql_path, 11, 'challenge', 'challenge', 'Desafio prático', $challenge$
## Relatório de turmas de um processo seletivo

Você recebeu duas tabelas:

- **turmas** tem id e nome.
- **inscricoes** tem id, turma_id, ativa e nota. A nota pode ser nula quando a correção ainda está pendente.

Escreva uma consulta SQL que mostre, por turma, **o total de inscrições ativas** e **quantas inscrições ativas têm nota publicada**. Inclua somente turmas que tenham **pelo menos três inscrições ativas**. Considere que turmas diferentes podem ter o mesmo nome.

Entregue a consulta e explique em poucas linhas como você tratou as notas pendentes. Você pode colar o texto ou informar o link HTTPS de um repositório com a solução.
$challenge$, ARRAY[
  'Relaciona as tabelas pela chave turma_id e conta somente inscrições ativas.',
  'Agrupa pela identidade da turma para preservar turmas diferentes com o mesmo nome.',
  'Aplica o mínimo de três inscrições ativas após o agrupamento.',
  'Distingue total de inscrições e notas presentes e explica como tratou NULL.'
]);

  INSERT INTO public.learning_path_steps (path_id, position, topic, kind, title, passing_score)
  VALUES (sql_path, 12, 'assessment', 'assessment', 'Avaliação final', 7)
  RETURNING id INTO assessment_step;

  FOR question IN SELECT * FROM (VALUES
    (1, 2, 'sql-projecao-livros'),
    (2, 2, 'sql-filtro-pontuacao'),
    (3, 4, 'sql-precedencia-cargos'),
    (4, 4, 'sql-filtro-turnos'),
    (5, 6, 'sql-inner-join-inscricoes'),
    (6, 6, 'sql-left-join-departamentos'),
    (7, 8, 'sql-contagem-por-status'),
    (8, 8, 'sql-having-tentativas'),
    (9, 10, 'sql-count-notas-nulas'),
    (10, 10, 'sql-filtro-data-ausente')
  ) AS q(final_position, step_position, slug) ORDER BY final_position
  LOOP
    SELECT v.id INTO pinned_version
    FROM public.quest_question_versions AS v
    JOIN quest_private.questions AS q ON q.id = v.question_id
    WHERE q.slug = question.slug AND v.version = 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Versão 1 ausente na coleção piloto: %', question.slug;
    END IF;
    SELECT id INTO STRICT practice_step FROM public.learning_path_steps
    WHERE path_id = sql_path AND position = question.step_position;
    practice_position := 1 + ((question.final_position - 1) % 2);
    INSERT INTO public.learning_step_questions (step_id, version_id, position)
    VALUES (practice_step, pinned_version, practice_position),
           (assessment_step, pinned_version, question.final_position);
  END LOOP;

  UPDATE public.learning_paths SET published_at = now() WHERE id = sql_path;
END;
$pilot$;
