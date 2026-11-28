export const sqlLabPath = '/dashboard/laboratorio-sql'
export const sqlLabSubmissionLimit = 4000

export const sqlLabChallenges = [
  {
    slug: 'select-where', title: 'Pedidos prontos para expedição', topic: 'SELECT e WHERE',
    schema: ['pedidos(id integer PK, cliente text, status text, valor numeric, criado_em date)'],
    task: 'Liste id, cliente e valor para os pedidos com status aprovado e valor maior ou igual a 150. Ordene do maior para o menor valor e desempate pelo id crescente.',
    rubric: ['Projeta apenas as três colunas solicitadas.', 'Inclui somente aprovados a partir de 150, inclusive.', 'Ordena valor decrescente e id crescente.'],
    hints: ['Separe projeção de filtro.', 'Combine o status e o limite de valor.', 'Dê duas chaves à ordenação, com sentidos diferentes.'],
  },
  {
    slug: 'and-or', title: 'Pré-seleção para o estágio', topic: 'AND e OR',
    schema: ['candidaturas(id integer PK, nome text, ativa boolean, turno text, pcd boolean)'],
    task: 'Liste id e nome das candidaturas ativas que aceitam o turno da noite ou são de pessoas com deficiência. Candidaturas inativas devem ficar de fora em todos os casos.',
    rubric: ['Exige candidatura ativa em todos os caminhos.', 'Agrupa a regra de turno e PCD corretamente.', 'Seleciona id e nome.'],
    hints: ['Identifique a condição obrigatória.', 'As duas formas de elegibilidade pertencem ao mesmo grupo.', 'Teste mentalmente uma candidatura inativa que atende ao segundo critério.'],
  },
  {
    slug: 'join', title: 'Clientes com e sem chamados', topic: 'INNER JOIN e LEFT JOIN',
    schema: ['clientes(id integer PK, nome text)', 'chamados(id integer PK, cliente_id integer FK → clientes.id, assunto text)'],
    task: 'Escreva duas consultas no mesmo envio. A primeira lista nome e assunto apenas de clientes com chamados. A segunda lista os mesmos campos de todos os clientes, incluindo aqueles sem chamado.',
    rubric: ['Relaciona chamados ao id de cliente.', 'Usa uma junção interna no primeiro cenário.', 'Preserva todos os clientes no segundo cenário.'],
    hints: ['Compare a presença de clientes sem par nas duas saídas.', 'A tabela de clientes deve ser o lado preservado da segunda consulta.', 'A chave cliente_id referencia id, mesmo que os nomes das colunas sejam diferentes.'],
  },
  {
    slug: 'group-having', title: 'Produtos elegíveis para reposição', topic: 'GROUP BY e HAVING',
    schema: ['vendas(id integer PK, produto_id integer, quantidade integer, status text)'],
    task: 'Para cada produto com pelo menos 30 unidades vendidas em pedidos concluídos, mostre produto_id e total de unidades. Pedidos cancelados não podem contribuir para o total.',
    rubric: ['Filtra apenas pedidos concluídos antes do agrupamento.', 'Agrupa pelo produto e soma unidades.', 'Filtra grupos com total igual ou superior a 30.'],
    hints: ['Use um filtro para linhas e outro para grupos.', 'A medida é quantidade total, e não número de pedidos.', 'Pense em qual cláusula consegue avaliar a soma de um grupo.'],
  },
  {
    slug: 'count-null', title: 'Notas publicadas por turma', topic: 'COUNT, NULL e agregações',
    schema: ['turmas(id integer PK, nome text)', 'resultados(id integer PK, turma_id integer FK → turmas.id, nota numeric NULL)'],
    task: 'Liste todas as turmas com o total de resultados cadastrados, o número de notas publicadas e a média das notas publicadas. Inclua turmas sem resultados e preserve a distinção entre nota zero e nota ausente.',
    rubric: ['Preserva turmas sem resultados.', 'Conta registros existentes pela chave do resultado e notas preenchidas pela coluna nota.', 'Calcula a média sem transformar ausência em zero e agrupa pelo id da turma.'],
    hints: ['Uma turma com uma linha preenchida por NULL após uma junção ainda pode ter zero resultados.', 'Uma coluna que é chave primária distingue o registro existente de uma linha sem par.', 'Considere separadamente a coluna usada para cada contagem e para a média.'],
  },
] as const

export function findSqlLabChallenge(slug: unknown) {
  return sqlLabChallenges.find((challenge) => challenge.slug === slug)
}

export function sqlLabHref(slug: string) {
  return sqlLabPath + '/' + encodeURIComponent(slug)
}

export function parseSqlLabSubmission(value: unknown) {
  return typeof value === 'string' && value.length <= sqlLabSubmissionLimit && value.trim() ? value.trim() : null
}
