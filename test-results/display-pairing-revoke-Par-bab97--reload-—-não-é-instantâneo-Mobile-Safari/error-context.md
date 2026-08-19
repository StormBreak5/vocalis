# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: display-pairing-revoke.spec.ts >> Pareamento de telão — Host revoga um telão >> revoga uma TV pareada sem afetar a outra; o efeito só se confirma no reload — não é instantâneo
- Location: e2e\display-pairing-revoke.spec.ts:5:7

# Error details

```
Test timeout of 120000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e4]:
      - generic [ref=e6]:
        - generic [ref=e7]:
          - img [ref=e9]
          - generic [ref=e13]:
            - generic [ref=e14]: Vocalis
            - heading "Painel do DJ" [level=1] [ref=e15]
        - generic [ref=e16]:
          - generic [ref=e17]: 532YBR
          - button "Copiar código da sala" [ref=e18]:
            - img [ref=e19]
        - generic "Estado da sessão" [ref=e22]:
          - status [ref=e23]: Ao vivo
        - button "Pausar fila" [ref=e26]:
          - img
          - text: Pausar fila
        - button "Abrir controles da sessão" [ref=e28]:
          - img [ref=e29]
      - generic [ref=e33]: Fila pronta para operação.
      - generic [ref=e35]:
        - tablist "Conteúdo do painel" [ref=e36]:
          - tab "Fila · 0" [ref=e37]
          - tab "Participantes · 0" [selected] [ref=e38]
        - tabpanel "Participantes · 0" [active] [ref=e39]:
          - generic "Resumo da sessão" [ref=e40]:
            - article [ref=e41]:
              - generic [ref=e42]:
                - generic [ref=e43]: Na fila
                - img [ref=e44]
              - generic [ref=e46]: "0"
            - article [ref=e47]:
              - generic [ref=e48]:
                - generic [ref=e49]: Online
                - img [ref=e50]
              - generic [ref=e55]: "0"
          - region "Participantes" [ref=e56]:
            - generic [ref=e57]:
              - generic [ref=e58]:
                - heading "Participantes" [level=2] [ref=e59]
                - paragraph [ref=e60]: 0 online · 0 registrados
              - generic "0 participantes online" [ref=e61]: "0"
            - generic [ref=e62]: Ninguém entrou na sala ainda.
          - region "Telões pareados" [ref=e63]:
            - generic [ref=e64]:
              - generic [ref=e65]:
                - heading "Telões pareados" [level=2] [ref=e66]
                - paragraph [ref=e67]: 1 pareado
              - generic "1 telões pareados" [ref=e68]: "1"
            - button "Parear telão" [ref=e69] [cursor=pointer]
            - generic [ref=e70]:
              - generic [ref=e71]: Código de pareamento
              - generic [ref=e72]: UKCZTX
              - generic [ref=e73]: Expira em 3:20
            - list "Telões pareados" [ref=e74]:
              - listitem [ref=e75]:
                - img [ref=e77]
                - generic [ref=e80]:
                  - generic [ref=e81]: Telão 1
                  - generic [ref=e82]: Pareado às 22:05
                - button "Revogar Telão 1" [ref=e83]:
                  - img [ref=e84]
                  - generic [ref=e87]: Revogar
  - region "Notifications alt+T"
  - alert [ref=e88]
```