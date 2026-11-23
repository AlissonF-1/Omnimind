DO $migration$
DECLARE
  question record;
  new_question_id uuid;
  new_version_id uuid;
  answer_option_id uuid;
BEGIN
  INSERT INTO public.quest_competencies (slug, name) VALUES
    ('select-where', 'SQL · SELECT e WHERE'),
    ('and-or', 'SQL · AND e OR'),
    ('join', 'SQL · JOIN'),
    ('group-by', 'SQL · GROUP BY'),
    ('having', 'SQL · HAVING'),
    ('count-null', 'SQL · COUNT e NULL');

  FOR question IN
    SELECT * FROM jsonb_to_recordset($pilot$
[
  {
    "slug": "sql-projecao-livros",
    "competency": "select-where",
    "statement": "A tabela livros tem as colunas id, titulo, autor e ano. Qual consulta retorna somente titulo e autor de todos os livros, preservando uma linha por registro?",
    "correct_position": 2,
    "options": [
      "SELECT * FROM livros;",
      "SELECT titulo, autor FROM livros;",
      "SELECT titulo FROM livros;",
      "SELECT DISTINCT titulo, autor FROM livros;",
      "SELECT autor, ano FROM livros;"
    ],
    "explanations": [
      "O asterisco inclui também id e ano.",
      "A lista após SELECT define as duas colunas, e a consulta preserva cada registro sem aplicar DISTINCT ou filtro.",
      "A projeção omite a coluna autor.",
      "DISTINCT pode unir registros diferentes que tenham o mesmo par de título e autor.",
      "A consulta inclui ano e omite titulo."
    ]
  },
  {
    "slug": "sql-filtro-pontuacao",
    "competency": "select-where",
    "statement": "A tabela provas(id, pontos) armazena pontuações inteiras. Qual consulta retorna o id de toda prova com pelo menos 70 pontos?",
    "correct_position": 4,
    "options": [
      "SELECT id FROM provas WHERE pontos > 70;",
      "SELECT id FROM provas WHERE pontos <= 70;",
      "SELECT id FROM provas WHERE pontos = 70;",
      "SELECT id FROM provas WHERE pontos >= 70;",
      "SELECT pontos FROM provas WHERE pontos >= 70;"
    ],
    "explanations": [
      "O operador > exclui as provas com exatamente 70 pontos.",
      "O operador <= inclui pontuações abaixo do corte e exclui as que o superam.",
      "A igualdade inclui apenas o limite e descarta as pontuações superiores.",
      "O operador >= inclui 70 e todas as pontuações superiores, e SELECT retorna o id pedido.",
      "O filtro está correto, mas a coluna retornada é pontos em vez de id."
    ]
  },
  {
    "slug": "sql-precedencia-cargos",
    "competency": "and-or",
    "statement": "Considere WHERE ativo = TRUE AND cargo = 'dev' OR cargo = 'dados'. Se ativo e cargo nunca forem NULL, quais linhas passam pelo filtro?",
    "correct_position": 3,
    "options": [
      "Apenas pessoas ativas com cargo dev ou dados.",
      "Todas as pessoas com cargo dev e apenas as ativas com cargo dados.",
      "Pessoas ativas com cargo dev e todas as pessoas com cargo dados.",
      "Todas as pessoas ativas, independentemente do cargo, e todas as pessoas com cargo dados.",
      "Apenas pessoas ativas com cargo dev."
    ],
    "explanations": [
      "Para aplicar ativo aos dois cargos, seria preciso agrupar os cargos com parênteses.",
      "A condição de ativo está ligada a dev. A ramificação de dados está depois do OR.",
      "AND tem precedência sobre OR. O filtro equivale a (ativo = TRUE AND cargo = 'dev') OR cargo = 'dados'.",
      "Estar ativo só é suficiente na primeira ramificação quando o cargo também é dev.",
      "O OR inclui as pessoas com cargo dados mesmo quando ativo é falso."
    ]
  },
  {
    "slug": "sql-filtro-turnos",
    "competency": "and-or",
    "statement": "A tabela vagas tem disponivel boolean e turno text, ambos obrigatórios. Qual filtro seleciona as vagas disponíveis de manhã ou de tarde?",
    "correct_position": 5,
    "options": [
      "WHERE disponivel = TRUE AND turno = 'manha' OR turno = 'tarde'",
      "WHERE (disponivel = TRUE OR turno = 'manha') AND turno = 'tarde'",
      "WHERE disponivel = TRUE OR turno IN ('manha', 'tarde')",
      "WHERE disponivel = TRUE AND turno = 'manha' AND turno = 'tarde'",
      "WHERE disponivel = TRUE AND (turno = 'manha' OR turno = 'tarde')"
    ],
    "explanations": [
      "O OR fica fora do AND e permite vagas da tarde indisponíveis.",
      "O último AND exige turno da tarde, excluindo todas as vagas da manhã.",
      "O OR permite uma vaga indisponível de manhã ou de tarde, e também uma vaga disponível em outro turno.",
      "Uma única coluna turno não pode ser igual a 'manha' e 'tarde' na mesma linha.",
      "Os parênteses agrupam os turnos aceitos. O AND exige disponibilidade para qualquer um deles."
    ]
  },
  {
    "slug": "sql-inner-join-inscricoes",
    "competency": "join",
    "statement": "candidatos(id) contém 1, 2 e 3. inscricoes(candidato_id, id) contém os pares (1, 10), (1, 11) e (3, 12). Quais pares, em qualquer ordem, são retornados por SELECT c.id, i.id FROM candidatos c INNER JOIN inscricoes i ON i.candidato_id = c.id?",
    "correct_position": 1,
    "options": [
      "(1, 10), (1, 11), (3, 12)",
      "(1, 10), (1, 11), (2, NULL), (3, 12)",
      "(1, 10), (3, 12)",
      "(1, 10), (2, 11), (3, 12)",
      "Todos os nove pares possíveis entre os três candidatos e as três inscrições."
    ],
    "explanations": [
      "Há uma linha por correspondência. O candidato 1 tem duas, o 3 tem uma e o 2 fica de fora.",
      "A linha do candidato 2 com NULL seria adicionada por um LEFT JOIN, não pelo INNER JOIN.",
      "O JOIN não escolhe uma inscrição por candidato. A inscrição 11 também corresponde ao candidato 1.",
      "A inscrição 11 tem candidato_id igual a 1. A posição das linhas nas tabelas não define o vínculo.",
      "Nove pares formariam um produto cartesiano. A condição ON mantém apenas IDs correspondentes."
    ]
  },
  {
    "slug": "sql-left-join-departamentos",
    "competency": "join",
    "statement": "departamentos(id, nome) e pessoas(id, departamento_id, nome) relacionam departamentos e pessoas. Qual consulta lista todos os departamentos e os nomes das pessoas associadas, incluindo cada departamento vazio com nome de pessoa NULL?",
    "correct_position": 4,
    "options": [
      "SELECT d.nome, p.nome FROM departamentos d INNER JOIN pessoas p ON p.departamento_id = d.id;",
      "SELECT d.nome, p.nome FROM pessoas p LEFT JOIN departamentos d ON p.departamento_id = d.id;",
      "SELECT d.nome, p.nome FROM departamentos d LEFT JOIN pessoas p ON p.departamento_id = d.id WHERE p.id IS NOT NULL;",
      "SELECT d.nome, p.nome FROM departamentos d LEFT JOIN pessoas p ON p.departamento_id = d.id;",
      "SELECT d.nome, p.nome FROM departamentos d CROSS JOIN pessoas p;"
    ],
    "explanations": [
      "INNER JOIN mantém apenas departamentos com uma pessoa correspondente.",
      "O lado preservado é pessoas. Departamentos sem pessoas não aparecem por causa desse LEFT JOIN.",
      "WHERE p.id IS NOT NULL remove as linhas adicionadas para departamentos vazios.",
      "O lado esquerdo é departamentos. Quando não existe pessoa associada, as colunas de pessoas recebem NULL.",
      "CROSS JOIN combina cada departamento com todas as pessoas, sem verificar a associação."
    ]
  },
  {
    "slug": "sql-contagem-por-status",
    "competency": "group-by",
    "statement": "Na tabela chamados(id, status), id identifica um chamado e status é obrigatório. Qual consulta retorna uma linha para cada status presente e o total de chamados daquele status?",
    "correct_position": 2,
    "options": [
      "SELECT COUNT(*) FROM chamados;",
      "SELECT status, COUNT(*) FROM chamados GROUP BY status;",
      "SELECT DISTINCT status FROM chamados;",
      "SELECT status, COUNT(DISTINCT status) FROM chamados GROUP BY status;",
      "SELECT status, COUNT(*) FROM chamados GROUP BY status, id;"
    ],
    "explanations": [
      "Sem GROUP BY, COUNT(*) retorna o total geral em uma linha.",
      "GROUP BY status cria um grupo por status. COUNT(*) conta todos os chamados daquele grupo.",
      "DISTINCT lista os status presentes, mas não calcula quantos chamados há em cada um.",
      "Cada grupo tem um único status distinto. A contagem retorna 1 para cada grupo, independentemente do tamanho.",
      "Agrupar também pelo id de cada chamado divide o grupo que deveria reunir todos os chamados do mesmo status."
    ]
  },
  {
    "slug": "sql-having-tentativas",
    "competency": "having",
    "statement": "tentativas(questao_id, usuario_id) tem uma linha por envio, inclusive quando o mesmo usuário envia mais de uma vez. Qual consulta retorna apenas os IDs das questões com pelo menos três envios?",
    "correct_position": 5,
    "options": [
      "SELECT questao_id FROM tentativas WHERE COUNT(*) >= 3 GROUP BY questao_id;",
      "SELECT questao_id FROM tentativas GROUP BY questao_id HAVING COUNT(*) > 3;",
      "SELECT questao_id FROM tentativas WHERE questao_id >= 3 GROUP BY questao_id;",
      "SELECT questao_id FROM tentativas GROUP BY questao_id HAVING COUNT(DISTINCT usuario_id) >= 3;",
      "SELECT questao_id FROM tentativas GROUP BY questao_id HAVING COUNT(*) >= 3;"
    ],
    "explanations": [
      "WHERE filtra linhas antes da agregação e não aceita COUNT(*) nesse nível. O filtro de grupos deve usar HAVING.",
      "O operador > exclui questões com exatamente três envios.",
      "O valor do identificador não indica quantos envios a questão tem.",
      "Esse filtro mede usuários distintos. Uma questão com três envios da mesma pessoa ficaria de fora.",
      "COUNT(*) conta todos os envios de cada questão. HAVING aplica o limite inclusivo depois do GROUP BY."
    ]
  },
  {
    "slug": "sql-count-notas-nulas",
    "competency": "count-null",
    "statement": "A coluna nota de resultados contém quatro linhas, com valores 10, NULL, 0 e NULL. Qual é o par retornado por SELECT COUNT(*), COUNT(nota) FROM resultados?",
    "correct_position": 3,
    "options": ["(4, 4)", "(2, 2)", "(4, 2)", "(4, 1)", "(2, 4)"],
    "explanations": [
      "COUNT(nota) ignora as linhas em que a nota é NULL.",
      "COUNT(*) inclui todas as linhas, inclusive as que têm nota NULL.",
      "Há quatro linhas no total. As notas 10 e 0 estão preenchidas e contam em COUNT(nota).",
      "Zero é um valor preenchido. Ele conta junto com a nota 10.",
      "As regras estão invertidas. O asterisco conta linhas, e a expressão nota conta valores não nulos."
    ]
  },
  {
    "slug": "sql-filtro-data-ausente",
    "competency": "count-null",
    "statement": "tarefas(id, concluida_em) usa uma coluna date que fica NULL enquanto uma tarefa está pendente. Qual condição seleciona exatamente as tarefas pendentes?",
    "correct_position": 1,
    "options": [
      "WHERE concluida_em IS NULL",
      "WHERE concluida_em = NULL",
      "WHERE concluida_em IS NOT NULL",
      "WHERE concluida_em <> NULL",
      "WHERE concluida_em = CURRENT_DATE"
    ],
    "explanations": [
      "IS NULL testa diretamente a ausência do valor, que representa o estado pendente.",
      "A igualdade com NULL produz valor lógico desconhecido. WHERE só mantém condições verdadeiras.",
      "IS NOT NULL seleciona as tarefas com data preenchida, ou seja, as concluídas.",
      "A desigualdade com NULL também produz valor lógico desconhecido e não seleciona pendências.",
      "A comparação seleciona tarefas concluídas hoje. Uma data ausente não é igual à data atual."
    ]
  }
]
$pilot$::jsonb) AS items(
      slug text, competency text, statement text, correct_position smallint,
      options text[], explanations text[]
    )
  LOOP
    INSERT INTO quest_private.questions (slug) VALUES (question.slug)
    RETURNING id INTO new_question_id;

    INSERT INTO public.quest_question_versions (question_id, competency_id, version, statement)
    VALUES (
      new_question_id,
      (SELECT id FROM public.quest_competencies WHERE slug = question.competency),
      1,
      question.statement
    ) RETURNING id INTO new_version_id;

    INSERT INTO public.quest_question_options (question_version_id, position, body)
    SELECT new_version_id, option_row.position::smallint, option_row.body
    FROM unnest(question.options) WITH ORDINALITY AS option_row(body, position);

    SELECT id INTO STRICT answer_option_id
    FROM public.quest_question_options
    WHERE question_version_id = new_version_id AND position = question.correct_position;

    INSERT INTO quest_private.question_answer_keys (question_version_id, correct_option_id, explanations)
    VALUES (new_version_id, answer_option_id, question.explanations);
  END LOOP;
END;
$migration$;
