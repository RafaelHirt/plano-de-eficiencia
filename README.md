# Plano de Eficiência

Painel financeiro dos Planos de Eficiência do workspace **Monitoramento - PEEs**. Cada planilha da raiz do workspace representa uma unidade. O painel consolida as planilhas selecionadas, como CEAPSOL-ISG, CORA-PIO XII e CRER-AGIR.

## Executar

Use Node.js 22.12 ou mais recente.

```sh
npm ci
npm run build
npm start
```

Abra `http://127.0.0.1:3000` na máquina que executa o servidor. Para desenvolver com recarregamento, use `npm run dev` no lugar dos dois últimos comandos. O painel inicia com unidades e valores fictícios identificados na tela.

## Prévia no Netlify

Conecte o repositório ao Netlify e selecione a branch `main`. O arquivo `netlify.toml` define o build e a pasta de publicação. A prévia estática usa dados de demonstração. A conexão com o Smartsheet requer o servidor Node e a credencial autorizada.

## Conectar às planilhas

1. Configure `SMARTSHEET_ACCESS_TOKEN` como segredo do ambiente do servidor. A conta do token deve ter acesso de leitura ao workspace e às planilhas selecionadas. No Codex Cloud, permita saída HTTPS para `api.smartsheet.com`.
2. Inicie ou reinicie o servidor com o segredo disponível. No painel, abra **Conectar Smartsheet** e selecione as planilhas das unidades.
3. Confirme as colunas **Mês**, **Ano** e os campos financeiros. A tela sugere os cabeçalhos das capturas, incluindo os que usam códigos contábeis. O mapeamento usa os títulos das colunas, que podem ter IDs diferentes em cada planilha.

O servidor localiza o workspace pelo link ou pelo nome exato se houver uma única correspondência. Se necessário, configure o ID numérico confirmado em `SMARTSHEET_WORKSPACE_ID`.

Enquanto o painel está aberto, ele consulta a API a cada cinco minutos. **Atualizar dados** solicita uma leitura imediata. Uma falha preserva a última leitura válida da sessão e exibe o erro. O navegador guarda a seleção de planilhas e o mapeamento. O token fica no servidor, e os saldos ficam na memória da sessão.

## Indicadores

- Os totais de ativo de custeio, fornecedores e obrigações tributárias somam os saldos informados das unidades na competência selecionada. A tela indica quantas unidades contribuíram para cada total.
- A evolução mensal usa um total por competência. Os demonstrativos mostram também as contas adicionais mapeadas, como aplicações financeiras e obrigações com pessoal.
- Uma linha com zero no total do ativo e demais campos financeiros vazios fica de fora. A tela sinaliza competências duplicadas na mesma unidade, que são excluídas dos totais.

O servidor escuta somente na interface local. Para conectar o workspace, use o ambiente privado da organização com a credencial autorizada.
