# KnowNex — architettura Markdown-first

Knowledge Nexus for Humans & AI Agents. Technical preview, non release stabile.
Licenza MIT; stato della pubblicazione in `PUBLICATION-REPORT.md`.

## Autorità e responsabilità

`memory/STATE.md` è lo stato operativo corrente. `memory/knowledge/<ID>.md`
contiene ciascuna conoscenza corrente, con identità/versione e relazioni uscenti.
Questi file sono leggibili e modificabili senza CLI. Nessun JSON corrente ne
replica il contenuto. La prosa dello stato è libera; il motore non la divide
artificialmente in campi sincronizzati.

`journal/<revision>.md` racconta una conferma e collega stato e note storiche.
Motivazioni mancanti restano dichiarate tali. Gli snapshot `.history/<revision>`
sono copie Markdown indipendenti: la loro responsabilità è preservare il passato,
non determinare o sostituire i file correnti. Il manifest storico contiene
metadati derivati e hash; è creato nella stessa conferma e non viene aggiornato
se un umano modifica i file correnti.

## Flusso

1. Lettura diretta: stato → link → nota, senza tool specializzati.
2. Discovery: frontmatter corrente → catalogo in memoria → candidati e percorsi.
3. Recupero mirato: nota selezionata → corpo e relazioni → eventuali vicini.
4. Storico: revisione esplicita → solo checkpoint → documenti con hash verificati.
5. Conferma: Markdown correnti + proposta tipizzata → validazione → snapshot,
   diario, pubblicazione corrente con STATE per ultimo, sotto lock cooperativo.

L'indice non è persistito: rilegge soltanto frontmatter, in blocchi limitati, e
non carica sistematicamente la prosa. Non dipende da timestamp e non può restituire
metadati di una cache obsoleta. Lo storico usa il catalogo derivato del checkpoint.
Le normali letture non scrivono nella memoria.

## Componenti

- `markdown.mjs`: codec ristretto, validazione di metadati e riferimenti condivisa.
- `core.mjs`: risoluzione, cinque primitive read-only, init/advance e checkpoint.
- `migrate.mjs`: conversione offline del formato precedente con backup integrale.
- CLI e MCP: accesso al medesimo motore; MCP resta read-only a root fissa.
- Skill: politica adattiva, senza router, numero di query obbligatorio o cache.

`inspect`, `neighbors` ed `expand` restano distinti per selettività del payload:
singola nota, destinazioni complete, oppure sorgente con vicini e archi di
collegamento. Nessuna espansione ricorsiva automatica. Il contenuto dei vicini
rimane nelle note; non viene materializzata un'altra vista narrativa.

## Confini delle garanzie

Le modifiche manuali non sono una transazione confermata. Le risposte current
possono mostrarle; `dirty` riguarda il documento letto. Una revisione esplicita
restituisce sempre la versione confermata, anche se è l'ultima disponibile.
Per confermare il working state usare advance. ID/versioni e revisioni restano
campi gestiti dal motore; cancellazioni dirette di note confermate sono errori.

Conserviamo rifiuto revisioni obsolete, aggiornamenti parziali dei nodi, archi
tipizzati, isolamento temporale, ordinamento, paginazione e mancata sovrascrittura
degli snapshot. L'atomicità multifile non è garantita: il lock impedisce letture
correnti cooperative durante la pubblicazione; un'interruzione lascia il sistema
bloccato per recupero esplicito. Nessuna promessa di serializzazione con editor
esterni o durabilità a power loss. Gli snapshot richiedono più disco perché
copiano tutte le note. Il catalogo non certifica i corpi non letti né validità
semantica, veridicità della prosa o link CommonMark arbitrari.

Gli artifact storici degli esperimenti restano nel loro formato originale e non
vengono aggiornati. La conversione esplicita su copie preserva ogni revisione e
un backup dell'intero vecchio storage; non c'è un runtime legacy parallelo.

Introduzione in `README.md`; contratti, procedure e limiti operativi in
`docs/CLI.md`. I report sperimentali restano locali e sono esclusi dalla pubblicazione.
