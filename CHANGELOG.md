# Changelog

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e o versionamento segue o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Unreleased]

## [0.1.0] - 2026-05-16

### Adicionado
- Captura de pacotes via WinDivert em modo sniff (somente leitura)
- Decodificação completa do `0x0836 search_store_info` do latamRO:
  - Nome da loja (latin-1), preço, refino, item, quantidade
  - 4 slots de cartas / encantos
  - Até 4 opções aleatórias (idx + valor + parâmetro)
- Banco estático de ~32 mil itens/cartas extraído do Divine Pride
- Lookup local de opções aleatórias a partir do `random_option_db` do rAthena
- Tela inicial com seletor de interface de rede
- Tela de catálogo ao vivo:
  - Resultados populam em tempo real conforme os pacotes chegam
  - Empty state com instruções para o jogador abrir o catálogo no jogo
  - Botões "Parar Gravação", "Limpar" e "Nova Sessão"
  - Indicador de gravação ativo com contagem de páginas e pacotes
- Barra lateral de filtros:
  - Faixa de refino (mín / máx)
  - Itens (OR — multi-seleção dos itens vistos na sessão)
  - Cartas / Encantos (AND — todas as selecionadas precisam estar no item)
  - Opções Aleatórias (AND, com faixa de valor por opção)
  - Listas se estreitam dinamicamente conforme as seleções
- Tabela de resultados ordenável (TanStack Table)
- Clique no nome do item / carta abre a página do Divine Pride no navegador
- Interface em pt-BR
- Workflow do GitHub Actions para gerar `.exe` + instaladores MSI/NSIS

[Unreleased]: https://github.com/adsonpleal/ragmarket/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/adsonpleal/ragmarket/releases/tag/v0.1.0
