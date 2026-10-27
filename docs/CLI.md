# KnowNex — CLI and format reference

Memoria locale di un progetto, leggibile direttamente da persone e agenti.
Node.js >=22, ESM. Motore e CLI usano la standard library; MCP usa le dipendenze
ufficiali già presenti. Nessuna configurazione globale è necessaria per leggere i Markdown.

```text
lib/core.mjs          lettura, navigazione, aggiornamenti e checkpoint
lib/markdown.mjs      formato ristretto e validazione condivisa
lib/migrate.mjs       conversione offline del precedente storage JSON
bin/memory.mjs       CLI
mcp/                 cinque tool read-only, stdio, root fissa
test/                verifiche funzionali
.agents/skills/agent-memory-navigate/SKILL.md
experiments/         artifact separati, esclusi da Git
```

## Memoria di un progetto

```text
memory/
  STATE.md                 stato operativo corrente autorevole
  knowledge/<ID>.md        conoscenze correnti autorevoli
  journal/0000.md          eventi di conferma, leggibili
  .history/<revision>/
    STATE.md               stato confermato a quella revisione
    knowledge/<ID>.md      note confermate a quella revisione
    manifest.json          metadati derivati e hash di integrità
    .complete              hash del manifest
```

Il catalogo è ricostruito in memoria dai frontmatter a ogni interrogazione.
Non esistono database, cache persistente o sincronizzazione JSON/Markdown.
Il manifest storico descrive un checkpoint immutabile, non una seconda autorità corrente.

Per iniziare basta leggere `memory/STATE.md` e seguire i link. Un riferimento noto
consente di leggere direttamente una nota. Usare `index` quando manca un punto
d'ingresso; navigare le relazioni soltanto quando servono altre evidenze.
CLI e MCP sono percorsi facoltativi.

## Formato Markdown

Frontmatter ristretto: una riga per campo, `chiave: valore-JSON`, delimitato da
`---`. Nessun YAML generico, chiavi duplicate, multilinea, ancore o commenti nel
frontmatter. I metadati delle note sono limitati a 64 KiB. Il corpo è Markdown.

```markdown
---
schema_version: 3
revision: 0
project_id: "example"
project_name: "Example"
focus_domain: null
domains: []
---

# Example

## Objective

Descrivere qui l'obiettivo.
```

Lo stato può organizzare liberamente obiettivo, stato, focus, decisioni, vincoli,
problemi e prossime attività. I riferimenti hanno forma `[Titolo](knowledge/ID.md)`.
Nessun parser ricostruisce campi narrativi da titoli o sezioni arbitrarie.

```markdown
---
id: "DEC-LOCAL"
version: 1
kind: "decision"
domain: "validation"
title: "Keep validation local-only"
lifecycle: "active"
---

Validate local filesystem destinations only. Skip remote URLs.

## Relations

- supported_by: [RES-LOCAL](RES-LOCAL.md)
```

La sezione finale `## Relations` è riservata alle relazioni uscenti e deve
esistere anche quando è vuota. Separarla dal corpo con una riga vuota. Tipi:
`supersedes`, `supported_by`, `relevant_to`. Il titolo è nel frontmatter, non è
necessario duplicarlo nel corpo. `summary` nelle risposte è l'intero corpo
narrativo della nota, senza frontmatter o sezione finale delle relazioni.

Tipi di nodo: `decision`, `result`, `issue`, `task`. Lifecycle: `active`,
`superseded`. ID: lettere ASCII, cifre, `_`, `-`, primo carattere alfanumerico;
domini e project ID minuscoli. Nomi riservati Windows e collisioni di maiuscole
sono rifiutati. Il dominio deve essere registrato in `STATE.md`.

Sono validati i link gestiti dal motore: `knowledge/ID.md` nello stato e `ID.md`
nel corpo delle note, con eventuale frammento. La sezione Relations usa il
formato esatto sopra. Altri link a codice, documenti o siti restano dati utente:
il motore non è un validatore CommonMark completo né un crawler.

## CLI

`--root` è la directory del progetto che contiene `memory/`. Percorsi relativi
risolti dalla working directory. Output JSON su stdout, errori su stderr, exit 1.

```powershell
node bin/memory.mjs init --root <project> --id <id> --name <name>
node bin/memory.mjs state --root <project> [--revision N]
node bin/memory.mjs inspect <id> --root <project> [--revision N]
node bin/memory.mjs index --root <project> [--revision N]
node bin/memory.mjs index --root <project> --list [--revision N] [--domain ID] [--kind TYPE] [--lifecycle STATUS] [--limit N] [--after ID]
node bin/memory.mjs neighbors <id> --root <project> [--revision N] [--relation TYPE] [--limit N]
node bin/memory.mjs expand <id> --root <project> [--revision N] [--relation TYPE] [--limit N]
node bin/memory.mjs advance --root <project> --proposal <proposal.json>
```

- `state`: identità, revisione, domini, focus, `content` Markdown, `path`, `dirty`.
- `inspect`: una nota completa con relazioni, versione, revisione, percorso e `dirty`.
- `index`: overview con conteggi o catalogo senza prosa. Filtri combinati;
  ordinamento per ID; default 20, limite 1–100. `after` deve identificare un
  risultato dei medesimi filtri/revisione. `total` precede paginazione;
  `complete` indica che non rimangono pagine successive; `next_after` è ID o null.
- `neighbors`: nodi destinazione completi, unici, ordinati, solo archi uscenti.
- `expand`: sorgente e vicini unici con tipi degli archi che li collegano;
  profondità 1, `total`, `truncated`, `complete`. Default 20; limite intero >=0.
  I limiti del traversal contano vicini, non byte: note lunghe producono payload lunghi.

### Modifiche e revisioni

I Markdown correnti sono modificabili direttamente. `revision` e `version` sono
gestiti dal motore: non cambiarli manualmente. `dirty` riguarda esclusivamente
il documento restituito; uno stato pulito non certifica tutte le note.
Il catalogo rilegge i metadati e vede immediatamente anche modifiche di pari
dimensione con timestamp ripristinato. Non certifica l'integrità dei corpi.

Senza `--revision`, le letture usano i file correnti, comprese modifiche non
confermate. Con `--revision N`, **anche se N coincide con l'ultima revisione**,
usano esclusivamente il checkpoint confermato. Per confermare modifiche manuali
usare `advance`, anche con un solo `set_state` senza campi.

```json
{
  "expected_revision": 0,
  "message": "Registrato il vincolo locale e la prossima verifica.",
  "reason": "Le esecuzioni devono funzionare offline.",
  "operations": [
    {
      "type": "set_state",
      "domains": ["validation"],
      "focus_domain": "validation",
      "content": "# Example\n\n## Objective\n\nValidare collegamenti locali.\n\n## References\n\n- [Decisione](knowledge/DEC-LOCAL.md)\n"
    },
    {
      "type": "upsert_node",
      "id": "DEC-LOCAL",
      "kind": "decision",
      "domain": "validation",
      "title": "Keep validation local-only",
      "summary": "Skip network requests.",
      "lifecycle": "active",
      "relations": []
    }
  ]
}
```

`set_state` sostituisce soltanto `content`, `domains` e/o `focus_domain` forniti.
`upsert_node` conserva i campi omessi delle note esistenti; nuove note richiedono
tutti i campi sopra. Una sola upsert per ID; versioni assegnate dal motore solo
quando cambia la rappresentazione canonica. La conferma include le modifiche
manuali correnti e incrementa la revisione. Le note confermate non si cancellano:
usare il lifecycle. `message` e `reason` sono facoltativi; le motivazioni assenti
sono dichiarate non registrate nel diario.

### Migrare lo storage precedente

```powershell
node bin/memory.mjs migrate --root <isolated-copy>
```

Conversione esplicita di schema 2, tutte le revisioni da 0 al corrente, hash
verificati. Riporta revisione, numero di revisioni e percorso del backup
`memory.v2-backup-<uuid>`; conserva l'intero vecchio albero byte per byte.
Non eseguire su pilot canonici. Il runtime non legge automaticamente il vecchio
formato. La migrazione rifiuta revisioni mancanti, hash errati e conflitti storici.
I vecchi campi narrativi diventano sezioni dello stato senza inventare motivazioni.

**Incompatibilità deliberate:** schema dello stato JSON in output 3;
`content` sostituisce `project.summary/objective` e i campi narrativi dei domini.
`set_project`, `upsert_domain`, `set_focus_domain`, `set_domain_nodes` sono rimossi
in favore di `set_state` e link Markdown. I vecchi script sperimentali restano
intatti ma richiedono il motore archiviato per essere rieseguiti.

## MCP facoltativo

Stessi cinque tool: `memory_state`, `memory_index`, `memory_inspect`,
`memory_neighbors`, `memory_expand`. Parametri corrispondenti alla CLI, senza
root per chiamata. Nessuna scrittura esposta. Risultati in `structuredContent`,
senza testo duplicato; `--text-results` restituisce invece un solo blocco JSON
testuale per client che ne necessitano. Errori applicativi con `isError: true`
e `error.code/message/details`; input malformati rifiutati dallo schema SDK.

Esempio da applicare **manualmente**, con percorsi assoluti verificati:

```toml
[mcp_servers.knownex]
command = "node"
args = ["/absolute/path/to/checkout/mcp/stdio.mjs", "--root", "/absolute/path/to/project"]
```

Nessuna configurazione Codex viene modificata dal progetto. Il server scrive
soltanto protocollo su stdout, diagnostica su stderr. Leggere direttamente i
Markdown non richiede attivare MCP o caricare la skill.

## Persistenza e limiti

Lock esclusivo cooperativo; validazione prima delle scritture; file temporanei,
fsync dei file, rename e checkpoint esclusivi. Il marker `.complete` viene scritto
dopo la pubblicazione corrente: snapshot soltanto preparati non sono interrogabili.
Gli snapshot sono copie indipendenti,
non hard link ai file modificabili. Le letture storiche verificano hash del
manifest e dei documenti recuperati; il catalogo storico usa metadati del manifest.
Non è una protezione da manomissioni con ricalcolo degli hash.

La pubblicazione multifile non è atomica. Letture correnti tramite motore sono
bloccate durante la scrittura; letture dirette o editor esterni non rispettano
il lock. Un'interruzione può lasciare checkpoint incompleto, temporanei o lock:
il motore blocca l'accesso corrente e richiede recupero manuale. Non eliminare
il lock senza ispezionare lo stato. Nessuna garanzia di durabilità da power loss
o fsync delle directory, nessun recupero automatico. La migrazione usa due rename
con rollback in caso di errore ordinario, ma resta interrompibile fra i rename.
Directory di staging fallite sono conservate per ispezione.

Le copie complete aumentano l'uso disco rispetto al vecchio storage deduplicato.
Il catalogo rilegge O(n) frontmatter, massimo 64 KiB per nota: nessun watcher/cache.
I link sono validati sulle note lette e su tutte quelle confermate, non durante
ogni catalogo. Per consistenza ripetibile scegliere una revisione esplicita.

## Verifiche

```powershell
node --test test/*.test.mjs
```

Una memoria minima leggibile e interrogabile è in `examples/basic/`.
La suite crea copie temporanee isolate: nessun pilot o benchmark LLM è richiesto.
Stato della preparazione pubblica in `PUBLICATION-REPORT.md`.
