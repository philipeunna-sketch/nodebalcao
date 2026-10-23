# Auditoria visual e design system

## Escopo preservado

- Projeto, rotas, URLs, autenticação, APIs, integrações e regras de negócio permanecem inalterados.
- Nenhum dado, tabela ou migração de banco foi modificado.
- Os componentes existentes continuam sendo a fonte de verdade da interface.

## Constatações da auditoria

- O estilo anterior estava concentrado em um arquivo global com mais de 4.000 linhas e várias camadas de sobrescrita.
- A mesma cor neutra aparecia em dezenas de variações próximas, dificultando consistência e manutenção.
- Cards utilizavam raios entre 6 e 24 pixels e sombras diferentes conforme a página.
- Botões principais e secundários possuíam alturas, raios, pesos e estados de foco diferentes.
- Formulários públicos, administrativos e da conta utilizavam geometrias e tipografias diferentes.
- Home, resultados, lojas, notícias, login e dashboards já reutilizavam componentes funcionais; a divergência era predominantemente visual.
- Regras antigas do dashboard ocultavam a navegação em telas pequenas e regras posteriores forçavam comportamentos diferentes para a mesma sidebar.
- Existiam textos auxiliares e metadados abaixo de 12 pixels em áreas de leitura e administração.

## Sistema unificado aplicado

- Família tipográfica única: `Inter`, com fallback de sistema compatível.
- Escala única de cores, texto, superfícies, bordas, foco e estados semânticos.
- Raio de 10 pixels para controles, 16 pixels para cards e 22 pixels para superfícies principais.
- Sombras compartilhadas para cards e superfícies elevadas.
- Campos com altura mínima de 46 pixels e estado de foco único.
- Botões principais e secundários com alturas, pesos, bordas e estados consistentes.
- Cards de anúncios, notícias, lojas, detalhes e dashboards alinhados ao mesmo padrão.
- Header, navegação, busca e rodapé alinhados à mesma largura máxima e ritmo de espaçamento.
- Dashboard administrativo e painel do usuário alinhados ao mesmo design system, sem alteração dos fluxos.
- Navegação administrativa preservada no mobile como faixa horizontal rolável, evitando perda de funcionalidades.
- Regras responsivas consolidadas para desktop, tablet e larguras de 320 a 430 pixels.

## Arquitetura

O arquivo `app/design-system.css` é carregado depois do CSS legado e concentra os tokens e as regras de apresentação compartilhadas. Isso permite modernização consistente e de baixo risco sem duplicar componentes ou alterar comportamento funcional.
