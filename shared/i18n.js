'use strict';

// Language of the dashboard. The page and dashboard.js are written in Dutch; in every other
// language each text the page shows is translated here as it appears: whole texts from WORDS,
// texts with a number or name in them from PATTERNS. Both hold one translation per language, in
// the order of COLUMNS. The choice is kept per screen and, the first time, follows the language
// of the browser. Edit this file in /shared and run `npm run sync`.

(function () {

  // Code, own name and locale for numbers and dates; Dutch is the language the page is written in
  const LANGUAGES = {
    nl: ['Nederlands', 'nl-NL'],
    en: ['English', 'en-GB'],
    de: ['Deutsch', 'de-DE'],
    no: ['Norsk', 'nb-NO'],
    sv: ['Svenska', 'sv-SE'],
    da: ['Dansk', 'da-DK'],
    it: ['Italiano', 'it-IT'],
    fr: ['Français', 'fr-FR'],
    pt: ['Português', 'pt-PT'],
    es: ['Español', 'es-ES'],
  };
  const COLUMNS = ['en', 'de', 'no', 'sv', 'da', 'it', 'fr', 'pt', 'es'];

  // The language of the browser, with Bokmål and Nynorsk both as Norwegian; English otherwise
  function browserLanguage() {
    for (const tag of navigator.languages || [navigator.language || '']) {
      let code = String(tag).toLowerCase().split('-')[0];
      if (code === 'nb' || code === 'nn') code = 'no';
      if (LANGUAGES[code]) return code;
    }
    return 'en';
  }

  const KEY = 'energy-dashboard-lang';
  let lang = null;
  try { lang = localStorage.getItem(KEY); } catch { /* storage unavailable */ }
  if (!LANGUAGES[lang]) lang = browserLanguage();
  const column = COLUMNS.indexOf(lang);

  const WORDS = {
    // Page
    'Energie': ['Energy', 'Energie', 'Energi', 'Energi', 'Energi', 'Energia', 'Énergie', 'Energia', 'Energía'],
    'Verbinden…': ['Connecting…', 'Verbinden…', 'Kobler til…', 'Ansluter…', 'Forbinder…', 'Connessione…', 'Connexion…', 'A ligar…', 'Conectando…'],
    'Vandaag': ['Today', 'Heute', 'I dag', 'Idag', 'I dag', 'Oggi', 'Aujourd\'hui', 'Hoje', 'Hoy'],
    'Gisteren': ['Yesterday', 'Gestern', 'I går', 'Igår', 'I går', 'Ieri', 'Hier', 'Ontem', 'Ayer'],
    'Week': ['Week', 'Woche', 'Uke', 'Vecka', 'Uge', 'Settimana', 'Semaine', 'Semana', 'Semana'],
    'Maand': ['Month', 'Monat', 'Måned', 'Månad', 'Måned', 'Mese', 'Mois', 'Mês', 'Mes'],
    'Deze week': ['This week', 'Diese Woche', 'Denne uken', 'Denna vecka', 'Denne uge', 'Questa settimana', 'Cette semaine', 'Esta semana', 'Esta semana'],
    'Deze maand': ['This month', 'Dieser Monat', 'Denne måneden', 'Denna månad', 'Denne måned', 'Questo mese', 'Ce mois-ci', 'Este mês', 'Este mes'],
    'Dit jaar': ['This year', 'Dieses Jahr', 'I år', 'I år', 'I år', 'Quest\'anno', 'Cette année', 'Este ano', 'Este año'],
    'Jaar': ['Year', 'Jahr', 'År', 'År', 'År', 'Anno', 'Année', 'Ano', 'Año'],
    'dit jaar': ['this year', 'dieses Jahr', 'i år', 'i år', 'i år', 'quest\'anno', 'cette année', 'este ano', 'este año'],
    'vorig jaar tot dezelfde maand': ['last year up to the same month', 'Vorjahr bis zum selben Monat', 'i fjor til samme måned', 'förra året till samma månad', 'sidste år til samme måned', 'l\'anno scorso fino allo stesso mese', 'l\'an dernier jusqu\'au même mois', 'o ano passado até ao mesmo mês', 'el año pasado hasta el mismo mes'],
    'Vaste kosten': ['Fixed costs', 'Fixkosten', 'Faste kostnader', 'Fasta kostnader', 'Faste omkostninger', 'Costi fissi', 'Frais fixes', 'Custos fixos', 'Costes fijos'],
    'min vermindering energiebelasting': ['minus energy tax reduction', 'abzüglich Energiesteuerermäßigung', 'minus reduksjon i energiavgift', 'minus sänkt energiskatt', 'minus nedsættelse af energiafgift', 'meno riduzione dell\'imposta sull\'energia', 'moins réduction de la taxe sur l\'énergie', 'menos redução do imposto sobre a energia', 'menos reducción del impuesto sobre la energía'],
    'all-in: markt + belasting + opslag': ['all-in: market + tax + markup', 'all-in: Markt + Steuer + Aufschlag', 'alt inkl.: marked + avgift + påslag', 'allt inkl.: marknad + skatt + påslag', 'alt inkl.: marked + afgift + tillæg', 'tutto incluso: mercato + imposte + maggiorazione', 'tout compris : marché + taxes + marge', 'tudo incluído: mercado + impostos + margem', 'todo incluido: mercado + impuestos + margen'],
    'marktprijs incl. btw': ['market price incl. VAT', 'Marktpreis inkl. MwSt.', 'markedspris inkl. mva', 'marknadspris inkl. moms', 'markedspris inkl. moms', 'prezzo di mercato IVA incl.', 'prix du marché TTC', 'preço de mercado c/ IVA', 'precio de mercado con IVA'],
    'Afname kost nu': ['Import costs now', 'Bezug kostet jetzt', 'Import koster nå', 'Import kostar nu', 'Import koster nu', 'Il prelievo costa ora', 'Le soutirage coûte maintenant', 'O consumo da rede custa agora', 'El consumo de red cuesta ahora'],
    'Teruglevering levert nu': ['Export earns now', 'Einspeisung bringt jetzt', 'Eksport gir nå', 'Export ger nu', 'Eksport giver nu', 'L\'immissione rende ora', 'L\'injection rapporte maintenant', 'A injeção rende agora', 'La inyección rinde ahora'],
    'vandaag': ['today', 'heute', 'i dag', 'idag', 'i dag', 'oggi', 'aujourd\'hui', 'hoje', 'hoy'],
    'gisteren': ['yesterday', 'gestern', 'i går', 'igår', 'i går', 'ieri', 'hier', 'ontem', 'ayer'],
    'deze week': ['this week', 'diese Woche', 'denne uken', 'denna vecka', 'denne uge', 'questa settimana', 'cette semaine', 'esta semana', 'esta semana'],
    'deze maand': ['this month', 'diesen Monat', 'denne måneden', 'denna månad', 'denne måned', 'questo mese', 'ce mois-ci', 'este mês', 'este mes'],
    'Periode': ['Period', 'Zeitraum', 'Periode', 'Period', 'Periode', 'Periodo', 'Période', 'Período', 'Periodo'],
    'Taal': ['Language', 'Sprache', 'Språk', 'Språk', 'Sprog', 'Lingua', 'Langue', 'Idioma', 'Idioma'],
    // Help menu and diagnosis
    'Probleem melden': ['Report a problem', 'Problem melden', 'Meld et problem', 'Rapportera ett problem', 'Rapportér et problem', 'Segnala un problema', 'Signaler un problème', 'Comunicar um problema', 'Informar de un problema'],
    'Handleiding': ['Manual', 'Anleitung', 'Veiledning', 'Handbok', 'Vejledning', 'Guida', 'Guide', 'Manual', 'Manual'],
    'Wordt een apparaat niet gevonden of klopt er iets niet? Stuur de maker een rapport: welke apps en metingen je apparaten hebben, zonder namen, ruimtes of locatie.': [
      'Is a device not found, or does something look wrong? Send the maker a report: which apps and readings your devices have, without names, rooms or location.',
      'Wird ein Gerät nicht gefunden oder stimmt etwas nicht? Schicke dem Entwickler einen Bericht: welche Apps und Messwerte deine Geräte haben, ohne Namen, Räume oder Standort.',
      'Blir en enhet ikke funnet, eller stemmer noe ikke? Send utvikleren en rapport: hvilke apper og målinger enhetene dine har, uten navn, rom eller sted.',
      'Hittas en enhet inte, eller stämmer något inte? Skicka en rapport till utvecklaren: vilka appar och mätvärden dina enheter har, utan namn, rum eller plats.',
      'Bliver en enhed ikke fundet, eller passer noget ikke? Send udvikleren en rapport: hvilke apps og målinger dine enheder har, uden navne, rum eller placering.',
      'Un dispositivo non viene trovato o qualcosa non torna? Invia un rapporto allo sviluppatore: quali app e misure hanno i tuoi dispositivi, senza nomi, stanze o posizione.',
      'Un appareil n\'est pas trouvé, ou quelque chose ne va pas ? Envoyez un rapport au développeur : les applications et mesures de vos appareils, sans noms, pièces ni emplacement.',
      'Um dispositivo não é encontrado, ou algo não está certo? Envie um relatório ao criador: que apps e medições os seus dispositivos têm, sem nomes, divisões nem localização.',
      '¿No se encuentra un dispositivo o algo no cuadra? Envía un informe al creador: qué apps y mediciones tienen tus dispositivos, sin nombres, estancias ni ubicación.'],
    'Mijn dashboard meesturen': ['Include my dashboard', 'Mein Dashboard mitsenden', 'Send med dashbordet mitt', 'Skicka med min instrumentpanel', 'Send mit dashboard med', 'Includi la mia dashboard', 'Joindre mon tableau de bord', 'Incluir o meu painel', 'Incluir mi panel'],
    'Diagnose mailen': ['E-mail diagnosis', 'Diagnose mailen', 'Send diagnose på e-post', 'Mejla diagnos', 'Send diagnose på e-mail', 'Invia diagnosi per e-mail', 'Envoyer le diagnostic par e-mail', 'Enviar diagnóstico por e-mail', 'Enviar diagnóstico por correo'],
    'Delen op GitHub': ['Share on GitHub', 'Auf GitHub teilen', 'Del på GitHub', 'Dela på GitHub', 'Del på GitHub', 'Condividi su GitHub', 'Partager sur GitHub', 'Partilhar no GitHub', 'Compartir en GitHub'],
    'Rapport maken…': ['Making report…', 'Bericht wird erstellt…', 'Lager rapport…', 'Skapar rapport…', 'Laver rapport…', 'Creazione del rapporto…', 'Création du rapport…', 'A criar relatório…', 'Creando informe…'],
    'Het rapport staat op je klembord. Staat het nog niet in de mail of het issue, plak het er dan in.': [
      'The report is on your clipboard. If it is not in the e-mail or issue yet, paste it in.',
      'Der Bericht ist in deiner Zwischenablage. Steht er noch nicht in der Mail oder dem Issue, füge ihn dort ein.',
      'Rapporten ligger på utklippstavlen. Står den ikke i e-posten eller saken ennå, lim den inn.',
      'Rapporten finns i urklipp. Står den inte i mejlet eller ärendet ännu, klistra in den.',
      'Rapporten ligger i din udklipsholder. Står den ikke i mailen eller sagen endnu, så indsæt den.',
      'Il rapporto è negli appunti. Se non è ancora nell\'e-mail o nella segnalazione, incollalo.',
      'Le rapport est dans votre presse-papiers. S\'il n\'est pas encore dans l\'e-mail ou le ticket, collez-le.',
      'O relatório está na sua área de transferência. Se ainda não estiver no e-mail ou no issue, cole-o.',
      'El informe está en tu portapapeles. Si aún no está en el correo o la incidencia, pégalo.'],
    'Wat werkt er niet goed? (bijvoorbeeld: mijn batterij wordt niet gevonden)': [
      'What does not work well? (for example: my battery is not found)',
      'Was funktioniert nicht gut? (zum Beispiel: meine Batterie wird nicht gefunden)',
      'Hva fungerer ikke bra? (for eksempel: batteriet mitt blir ikke funnet)',
      'Vad fungerar inte bra? (till exempel: mitt batteri hittas inte)',
      'Hvad virker ikke godt? (for eksempel: mit batteri bliver ikke fundet)',
      'Cosa non funziona bene? (ad esempio: la mia batteria non viene trovata)',
      'Qu\'est-ce qui ne fonctionne pas bien ? (par exemple : ma batterie n\'est pas trouvée)',
      'O que não funciona bem? (por exemplo: a minha bateria não é encontrada)',
      '¿Qué no funciona bien? (por ejemplo: no se encuentra mi batería)'],
    '(Plak hier het rapport; het staat op je klembord.)': ['(Paste the report here; it is on your clipboard.)', '(Füge den Bericht hier ein; er ist in deiner Zwischenablage.)', '(Lim inn rapporten her; den ligger på utklippstavlen.)', '(Klistra in rapporten här; den finns i urklipp.)', '(Indsæt rapporten her; den ligger i din udklipsholder.)', '(Incolla qui il rapporto; è negli appunti.)', '(Collez le rapport ici ; il est dans votre presse-papiers.)', '(Cole aqui o relatório; está na sua área de transferência.)', '(Pega aquí el informe; está en tu portapapeles.)'],
    'Momentopname': ['Snapshot', 'Momentaufnahme', 'Øyeblikksbilde', 'Ögonblicksbild', 'Øjebliksbillede', 'Istantanea', 'Instantané', 'Instantâneo', 'Instantánea'],
    'Demo': ['Demo', 'Demo', 'Demo', 'Demo', 'Demo', 'Demo', 'Démo', 'Demo', 'Demo'],
    'Live': ['Live', 'Live', 'Live', 'Live', 'Live', 'Live', 'Direct', 'Ao vivo', 'En vivo'],
    'Geen verbinding': ['No connection', 'Keine Verbindung', 'Ingen tilkobling', 'Ingen anslutning', 'Ingen forbindelse', 'Nessuna connessione', 'Pas de connexion', 'Sem ligação', 'Sin conexión'],
    'Kan geen gegevens ophalen.': ['Cannot load data.', 'Daten können nicht geladen werden.', 'Kan ikke hente data.', 'Kan inte hämta data.', 'Kan ikke hente data.', 'Impossibile caricare i dati.', 'Impossible de charger les données.', 'Não é possível carregar os dados.', 'No se pueden cargar los datos.'],
    'Laden…': ['Loading…', 'Laden…', 'Laster…', 'Laddar…', 'Indlæser…', 'Caricamento…', 'Chargement…', 'A carregar…', 'Cargando…'],
    'Nog geen gegevens voor deze periode': ['No data for this period yet', 'Noch keine Daten für diesen Zeitraum', 'Ingen data for denne perioden ennå', 'Inga data för denna period ännu', 'Ingen data for denne periode endnu', 'Ancora nessun dato per questo periodo', 'Pas encore de données pour cette période', 'Ainda sem dados para este período', 'Aún no hay datos para este periodo'],

    // Edit mode
    'Indeling bewerken': ['Edit layout', 'Layout bearbeiten', 'Rediger oppsett', 'Redigera layout', 'Rediger layout', 'Modifica layout', 'Modifier la disposition', 'Editar disposição', 'Editar diseño'],
    'Sleep': ['Drag', 'Ziehe', 'Dra', 'Dra', 'Træk', 'Trascina', 'Faites glisser', 'Arraste', 'Arrastra'],
    'om een blok te verplaatsen. Sleep de rand rechts voor de breedte en de rand onder voor de hoogte.': [
      'to move a block. Drag the right edge for the width and the bottom edge for the height.',
      'um einen Block zu verschieben. Ziehe den rechten Rand für die Breite und den unteren Rand für die Höhe.',
      'for å flytte en blokk. Dra høyre kant for bredden og nederste kant for høyden.',
      'för att flytta ett block. Dra högerkanten för bredden och nederkanten för höjden.',
      'for at flytte en blok. Træk i højre kant for bredden og nederste kant for højden.',
      'per spostare un blocco. Trascina il bordo destro per la larghezza e il bordo inferiore per l\'altezza.',
      'pour déplacer un bloc. Faites glisser le bord droit pour la largeur et le bord inférieur pour la hauteur.',
      'para mover um bloco. Arraste a margem direita para a largura e a margem inferior para a altura.',
      'para mover un bloque. Arrastra el borde derecho para el ancho y el borde inferior para la altura.'],
    'Handleiding: wat elk blok toont ↗': ['Manual: what each block shows ↗', 'Anleitung: was jeder Block zeigt ↗', 'Veiledning: hva hver blokk viser ↗', 'Handbok: vad varje block visar ↗', 'Vejledning: hvad hver blok viser ↗', 'Guida: cosa mostra ogni blocco ↗', 'Guide : ce que montre chaque bloc ↗', 'Manual: o que cada bloco mostra ↗', 'Manual: qué muestra cada bloque ↗'],
    'Standaard': ['Default', 'Standard', 'Standard', 'Standard', 'Standard', 'Predefinito', 'Par défaut', 'Predefinido', 'Predeterminado'],
    'Annuleren': ['Cancel', 'Abbrechen', 'Avbryt', 'Avbryt', 'Annuller', 'Annulla', 'Annuler', 'Cancelar', 'Cancelar'],
    'Opslaan': ['Save', 'Speichern', 'Lagre', 'Spara', 'Gem', 'Salva', 'Enregistrer', 'Guardar', 'Guardar'],
    'Opslaan…': ['Saving…', 'Speichern…', 'Lagrer…', 'Sparar…', 'Gemmer…', 'Salvataggio…', 'Enregistrement…', 'A guardar…', 'Guardando…'],
    'Pincode': ['PIN', 'PIN', 'PIN-kode', 'PIN-kod', 'Pinkode', 'PIN', 'Code PIN', 'PIN', 'PIN'],
    'Toevoegen:': ['Add:', 'Hinzufügen:', 'Legg til:', 'Lägg till:', 'Tilføj:', 'Aggiungi:', 'Ajouter :', 'Adicionar:', 'Añadir:'],
    'Hoogte auto': ['Auto height', 'Auto-Höhe', 'Auto høyde', 'Auto höjd', 'Auto højde', 'Altezza auto', 'Hauteur auto', 'Altura auto', 'Altura auto'],
    'Hoogte weer laten bepalen door de inhoud': ['Let the content decide the height again', 'Höhe wieder vom Inhalt bestimmen lassen', 'La innholdet bestemme høyden igjen', 'Låt innehållet bestämma höjden igen', 'Lad indholdet bestemme højden igen', 'Lascia di nuovo decidere l\'altezza al contenuto', 'Laisser de nouveau le contenu fixer la hauteur', 'Deixar de novo o conteúdo definir a altura', 'Dejar que el contenido vuelva a decidir la altura'],
    'Verplaatsen': ['Move', 'Verschieben', 'Flytt', 'Flytta', 'Flyt', 'Sposta', 'Déplacer', 'Mover', 'Mover'],
    'Verbergen': ['Hide', 'Ausblenden', 'Skjul', 'Dölj', 'Skjul', 'Nascondi', 'Masquer', 'Ocultar', 'Ocultar'],
    'Sleep om de breedte te veranderen': ['Drag to change the width', 'Ziehen, um die Breite zu ändern', 'Dra for å endre bredden', 'Dra för att ändra bredden', 'Træk for at ændre bredden', 'Trascina per cambiare la larghezza', 'Faites glisser pour changer la largeur', 'Arraste para alterar a largura', 'Arrastra para cambiar el ancho'],
    'Sleep om de hoogte te veranderen': ['Drag to change the height', 'Ziehen, um die Höhe zu ändern', 'Dra for å endre høyden', 'Dra för att ändra höjden', 'Træk for at ændre højden', 'Trascina per cambiare l\'altezza', 'Faites glisser pour changer la hauteur', 'Arraste para alterar a altura', 'Arrastra para cambiar la altura'],
    'hele breedte': ['full width', 'volle Breite', 'full bredde', 'full bredd', 'fuld bredde', 'larghezza intera', 'pleine largeur', 'largura total', 'ancho completo'],
    'Weergave': ['View', 'Ansicht', 'Visning', 'Visning', 'Visning', 'Vista', 'Affichage', 'Vista', 'Vista'],
    'Indeling': ['Layout', 'Layout', 'Oppsett', 'Layout', 'Layout', 'Layout', 'Disposition', 'Disposição', 'Diseño'],
    'Standaard indeling': ['Default layout', 'Standardlayout', 'Standardoppsett', 'Standardlayout', 'Standardlayout', 'Layout predefinito', 'Disposition par défaut', 'Disposição predefinida', 'Diseño predeterminado'],
    'Automatische indeling': ['Automatic layout', 'Automatisches Layout', 'Automatisk oppsett', 'Automatisk layout', 'Automatisk layout', 'Layout automatico', 'Disposition automatique', 'Disposição automática', 'Diseño automático'],
    'Blokken weer automatisch laten kiezen': ['Let the blocks be chosen automatically again', 'Blöcke wieder automatisch wählen lassen', 'La blokkene velges automatisk igjen', 'Låt blocken väljas automatiskt igen', 'Lad blokkene blive valgt automatisk igen', 'Lascia di nuovo scegliere i blocchi automaticamente', 'Laisser de nouveau choisir les blocs automatiquement', 'Deixar de novo os blocos serem escolhidos automaticamente', 'Dejar que los bloques se elijan automáticamente otra vez'],
    'Verschijnt na het opslaan van de indeling': ['Appears after saving the layout', 'Erscheint nach dem Speichern des Layouts', 'Vises etter at oppsettet er lagret', 'Visas när layouten har sparats', 'Vises, når layoutet er gemt', 'Compare dopo aver salvato il layout', 'Apparaît après l\'enregistrement de la disposition', 'Aparece depois de guardar a disposição', 'Aparece después de guardar el diseño'],
    'Nieuwe indeling…': ['New layout…', 'Neues Layout…', 'Nytt oppsett…', 'Ny layout…', 'Nyt layout…', 'Nuovo layout…', 'Nouvelle disposition…', 'Nova disposição…', 'Nuevo diseño…'],
    'Naam, bijv. keuken': ['Name, e.g. kitchen', 'Name, z. B. wohnzimmer', 'Navn, f.eks. stue', 'Namn, t.ex. hall', 'Navn, f.eks. stue', 'Nome, ad es. cucina', 'Nom, p. ex. cuisine', 'Nome, p. ex. cozinha', 'Nombre, p. ej. cocina'],
    'Indeling verwijderen': ['Delete layout', 'Layout löschen', 'Slett oppsett', 'Ta bort layout', 'Slet layout', 'Elimina layout', 'Supprimer la disposition', 'Eliminar disposição', 'Eliminar diseño'],
    'Geef de indeling een naam van letters, cijfers of streepjes': ['Give the layout a name of letters, digits or dashes', 'Gib dem Layout einen Namen aus Buchstaben, Ziffern oder Bindestrichen', 'Gi oppsettet et navn med bokstaver, sifre eller bindestreker', 'Ge layouten ett namn med bokstäver, siffror eller bindestreck', 'Giv layoutet et navn med bogstaver, tal eller bindestreger', 'Dai al layout un nome con lettere, cifre o trattini', 'Donnez à la disposition un nom en lettres, chiffres ou tirets', 'Dê à disposição um nome com letras, algarismos ou hífenes', 'Da al diseño un nombre con letras, cifras o guiones'],
    'Scherm': ['Screen', 'Bildschirm', 'Skjerm', 'Skärm', 'Skærm', 'Schermo', 'Écran', 'Ecrã', 'Pantalla'],
    'Volledig scherm': ['Full screen', 'Vollbild', 'Fullskjerm', 'Helskärm', 'Fuld skærm', 'Schermo intero', 'Plein écran', 'Ecrã inteiro', 'Pantalla completa'],
    'Periode exporteren (CSV)': ['Export period (CSV)', 'Zeitraum exportieren (CSV)', 'Eksporter periode (CSV)', 'Exportera period (CSV)', 'Eksportér periode (CSV)', 'Esporta periodo (CSV)', 'Exporter la période (CSV)', 'Exportar período (CSV)', 'Exportar periodo (CSV)'],
    'Scherm aan houden': ['Keep screen on', 'Bildschirm anlassen', 'Hold skjermen på', 'Håll skärmen på', 'Hold skærmen tændt', 'Mantieni lo schermo acceso', 'Garder l\'écran allumé', 'Manter o ecrã ligado', 'Mantener la pantalla encendida'],
    'Nachtstand': ['Night mode', 'Nachtmodus', 'Nattmodus', 'Nattläge', 'Nattilstand', 'Modalità notte', 'Mode nuit', 'Modo noturno', 'Modo nocturno'],
    'Beweging': ['Motion', 'Bewegung', 'Bevegelse', 'Rörelse', 'Bevægelse', 'Movimento', 'Mouvement', 'Movimento', 'Movimiento'],
    'Licht of donker': ['Light or dark', 'Hell oder dunkel', 'Lys eller mørk', 'Ljust eller mörkt', 'Lys eller mørk', 'Chiaro o scuro', 'Clair ou sombre', 'Claro ou escuro', 'Claro u oscuro'],
    'Licht': ['Light', 'Hell', 'Lys', 'Ljust', 'Lys', 'Chiaro', 'Clair', 'Claro', 'Claro'],
    'Donker': ['Dark', 'Dunkel', 'Mørk', 'Mörkt', 'Mørk', 'Scuro', 'Sombre', 'Escuro', 'Oscuro'],
    'Volgt de zon': ['Follows the sun', 'Folgt der Sonne', 'Følger solen', 'Följer solen', 'Følger solen', 'Segue il sole', 'Suit le soleil', 'Segue o sol', 'Sigue al sol'],
    'Sfeerkleur achtergrond': ['Mood color in background', 'Stimmungsfarbe im Hintergrund', 'Stemningsfarge i bakgrunnen', 'Stämningsfärg i bakgrunden', 'Stemningsfarve i baggrunden', 'Colore d\'atmosfera sullo sfondo', 'Couleur d\'ambiance en arrière-plan', 'Cor ambiente no fundo', 'Color ambiental de fondo'],
    'Alle effecten': ['All effects', 'Alle Effekte', 'Alle effekter', 'Alla effekter', 'Alle effekter', 'Tutti gli effetti', 'Tous les effets', 'Todos os efeitos', 'Todos los efectos'],
    'Dimmen': ['Dim', 'Dimmen', 'Dimme', 'Dimma', 'Dæmp', 'Attenua', 'Atténuer', 'Escurecer', 'Atenuar'],
    'Zwart': ['Black', 'Schwarz', 'Svart', 'Svart', 'Sort', 'Nero', 'Noir', 'Preto', 'Negro'],
    'Van – tot': ['From – to', 'Von – bis', 'Fra – til', 'Från – till', 'Fra – til', 'Da – a', 'De – à', 'De – a', 'De – a'],
    'Deze keuzes gelden alleen voor dit scherm.': ['These choices apply to this screen only.', 'Diese Einstellungen gelten nur für diesen Bildschirm.', 'Disse valgene gjelder bare for denne skjermen.', 'Dessa val gäller bara för den här skärmen.', 'Disse valg gælder kun for denne skærm.', 'Queste scelte valgono solo per questo schermo.', 'Ces choix s\'appliquent uniquement à cet écran.', 'Estas escolhas aplicam-se apenas a este ecrã.', 'Estas opciones solo se aplican a esta pantalla.'],

    // Block titles (also sent by the server)
    'Nu': ['Now', 'Jetzt', 'Nå', 'Nu', 'Nu', 'Ora', 'Maintenant', 'Agora', 'Ahora'],
    'Energie nu': ['Energy now', 'Energie jetzt', 'Energi nå', 'Energi nu', 'Energi nu', 'Energia ora', 'Énergie maintenant', 'Energia agora', 'Energía ahora'],
    'Warm water': ['Hot water', 'Warmwasser', 'Varmtvann', 'Varmvatten', 'Varmt vand', 'Acqua calda', 'Eau chaude', 'Água quente', 'Agua caliente'],
    'Verwarming': ['Heating', 'Heizung', 'Oppvarming', 'Uppvärmning', 'Opvarmning', 'Riscaldamento', 'Chauffage', 'Aquecimento', 'Calefacción'],
    'Laadpaal': ['EV charger', 'Wallbox', 'Elbillader', 'Laddbox', 'Ladeboks', 'Wallbox', 'Borne de recharge', 'Carregador VE', 'Cargador VE'],
    'Totalen': ['Totals', 'Summen', 'Totaler', 'Totaler', 'Totaler', 'Totali', 'Totaux', 'Totais', 'Totales'],
    'Stroomprijs': ['Electricity price', 'Strompreis', 'Strømpris', 'Elpris', 'Elpris', 'Prezzo dell\'elettricità', 'Prix de l\'électricité', 'Preço da eletricidade', 'Precio de la luz'],
    'Kengetallen': ['Key figures', 'Kennzahlen', 'Nøkkeltall', 'Nyckeltal', 'Nøgletal', 'Indicatori', 'Indicateurs', 'Indicadores', 'Indicadores'],
    'Elektriciteit': ['Electricity', 'Strom', 'Strøm', 'El', 'El', 'Elettricità', 'Électricité', 'Eletricidade', 'Electricidad'],
    'Vermogen vandaag': ['Power today', 'Leistung heute', 'Effekt i dag', 'Effekt idag', 'Effekt i dag', 'Potenza oggi', 'Puissance aujourd\'hui', 'Potência hoje', 'Potencia hoy'],
    'Apparaten nu': ['Devices now', 'Geräte jetzt', 'Enheter nå', 'Enheter nu', 'Enheder nu', 'Dispositivi ora', 'Appareils maintenant', 'Dispositivos agora', 'Dispositivos ahora'],
    'Energiestromen': ['Energy flows', 'Energieflüsse', 'Energiflyt', 'Energiflöden', 'Energistrømme', 'Flussi di energia', 'Flux d\'énergie', 'Fluxos de energia', 'Flujos de energía'],
    'Verbruik per apparaat': ['Use per device', 'Verbrauch pro Gerät', 'Forbruk per enhet', 'Förbrukning per enhet', 'Forbrug pr. enhed', 'Consumo per dispositivo', 'Consommation par appareil', 'Consumo por dispositivo', 'Consumo por dispositivo'],
    'Kosten': ['Costs', 'Kosten', 'Kostnader', 'Kostnader', 'Omkostninger', 'Costi', 'Coûts', 'Custos', 'Costes'],
    'Zonne-energie': ['Solar energy', 'Solarenergie', 'Solenergi', 'Solenergi', 'Solenergi', 'Energia solare', 'Énergie solaire', 'Energia solar', 'Energía solar'],
    'Gas': ['Gas', 'Gas', 'Gass', 'Gas', 'Gas', 'Gas', 'Gaz', 'Gás', 'Gas'],
    'Water': ['Water', 'Wasser', 'Vann', 'Vatten', 'Vand', 'Acqua', 'Eau', 'Água', 'Agua'],
    'Sluipverbruik': ['Standby use', 'Standby-Verbrauch', 'Standby-forbruk', 'Standby-förbrukning', 'Standbyforbrug', 'Consumo in standby', 'Consommation en veille', 'Consumo em standby', 'Consumo en espera'],
    'Fasebelasting': ['Phase load', 'Phasenlast', 'Fasebelastning', 'Fasbelastning', 'Fasebelastning', 'Carico per fase', 'Charge par phase', 'Carga por fase', 'Carga por fase'],

    // Energy now
    'Actuele energiestroom': ['Current energy flow', 'Aktueller Energiefluss', 'Nåværende energiflyt', 'Aktuellt energiflöde', 'Aktuel energistrøm', 'Flusso di energia attuale', 'Flux d\'énergie actuel', 'Fluxo de energia atual', 'Flujo de energía actual'],
    'Zon': ['Solar', 'Solar', 'Sol', 'Sol', 'Sol', 'Sole', 'Solaire', 'Solar', 'Solar'],
    'Net': ['Grid', 'Netz', 'Nett', 'Nät', 'Net', 'Rete', 'Réseau', 'Rede', 'Red'],
    'Huis': ['Home', 'Haus', 'Hus', 'Hus', 'Hus', 'Casa', 'Maison', 'Casa', 'Casa'],
    'Batterij': ['Battery', 'Batterie', 'Batteri', 'Batteri', 'Batteri', 'Batteria', 'Batterie', 'Bateria', 'Batería'],
    'terug': ['export', 'Einspeisung', 'eksport', 'export', 'eksport', 'immissione', 'injection', 'injeção', 'inyección'],
    'afname': ['import', 'Bezug', 'import', 'import', 'import', 'prelievo', 'soutirage', 'consumo', 'consumo'],
    'laden': ['charging', 'lädt', 'lader', 'laddar', 'lader', 'in carica', 'en charge', 'a carregar', 'cargando'],
    'ontladen': ['discharging', 'entlädt', 'utlader', 'urladdar', 'aflader', 'in scarica', 'en décharge', 'a descarregar', 'descargando'],

    // Hot water
    'Geen boiler gevonden. Kies er een bij de instellingen.': ['No water heater found. Choose one in the settings.', 'Kein Warmwasserspeicher gefunden. Wähle einen in den Einstellungen.', 'Ingen varmtvannsbereder funnet. Velg en i innstillingene.', 'Ingen varmvattenberedare hittades. Välj en i inställningarna.', 'Ingen varmtvandsbeholder fundet. Vælg en i indstillingerne.', 'Nessuno scaldabagno trovato. Scegline uno nelle impostazioni.', 'Aucun chauffe-eau trouvé. Choisissez-en un dans les réglages.', 'Nenhum termoacumulador encontrado. Escolha um nas definições.', 'No se encontró ningún calentador de agua. Elige uno en los ajustes.'],
    'doucheminuten': ['shower minutes', 'Duschminuten', 'dusjminutter', 'duschminuter', 'bruseminutter', 'minuti di doccia', 'minutes de douche', 'minutos de duche', 'minutos de ducha'],
    'Douchebeurten': ['Showers', 'Duschen', 'Dusjer', 'Duschar', 'Brusebade', 'Docce', 'Douches', 'Duches', 'Duchas'],
    'Ingesteld': ['Target', 'Soll', 'Innstilt', 'Inställt', 'Indstillet', 'Impostato', 'Consigne', 'Definido', 'Objetivo'],
    'Opwarmen': ['Heating up', 'Aufheizen', 'Varmer opp', 'Värmer upp', 'Varmer op', 'In riscaldamento', 'Chauffe', 'A aquecer', 'Calentando'],
    'Warm': ['Hot', 'Heiß', 'Varm', 'Varmt', 'Varmt', 'Calda', 'Chaude', 'Quente', 'Caliente'],
    'Lauw': ['Lukewarm', 'Lauwarm', 'Lunken', 'Ljummet', 'Lunkent', 'Tiepida', 'Tiède', 'Morna', 'Tibia'],
    'Koud': ['Cold', 'Kalt', 'Kald', 'Kallt', 'Koldt', 'Fredda', 'Froide', 'Fria', 'Fría'],
    'Onbekend': ['Unknown', 'Unbekannt', 'Ukjent', 'Okänt', 'Ukendt', 'Sconosciuto', 'Inconnu', 'Desconhecido', 'Desconocido'],
    'Watertemperatuur': ['Water temperature', 'Wassertemperatur', 'Vanntemperatur', 'Vattentemperatur', 'Vandtemperatur', 'Temperatura dell\'acqua', 'Température de l\'eau', 'Temperatura da água', 'Temperatura del agua'],
    'Boilertemperatuur': ['Water heater temperature', 'Speichertemperatur', 'Beredertemperatur', 'Beredartemperatur', 'Beholdertemperatur', 'Temperatura dello scaldabagno', 'Température du chauffe-eau', 'Temperatura do termoacumulador', 'Temperatura del calentador'],
    'Boiler': ['Water heater', 'Warmwasserspeicher', 'Varmtvannsbereder', 'Varmvattenberedare', 'Varmtvandsbeholder', 'Scaldabagno', 'Chauffe-eau', 'Termoacumulador', 'Calentador'],
    'Uit': ['Off', 'Aus', 'Av', 'Av', 'Fra', 'Spento', 'Arrêt', 'Desligado', 'Apagado'],
    'Aan': ['On', 'An', 'På', 'På', 'Til', 'Acceso', 'Marche', 'Ligado', 'Encendido'],
    'Niet beschikbaar': ['Unavailable', 'Nicht verfügbar', 'Ikke tilgjengelig', 'Inte tillgänglig', 'Ikke tilgængelig', 'Non disponibile', 'Indisponible', 'Indisponível', 'No disponible'],
    'Ja': ['Yes', 'Ja', 'Ja', 'Ja', 'Ja', 'Sì', 'Oui', 'Sim', 'Sí'],
    'Nee': ['No', 'Nein', 'Nei', 'Nej', 'Nej', 'No', 'Non', 'Não', 'No'],

    // Modes and states (sent by the server)
    'Programma': ['Program', 'Programm', 'Program', 'Program', 'Program', 'Programma', 'Programme', 'Programa', 'Programa'],
    'Elektrisch': ['Electric', 'Elektrisch', 'Elektrisk', 'Elektrisk', 'Elektrisk', 'Elettrico', 'Électrique', 'Elétrico', 'Eléctrico'],
    'Prestatie': ['Performance', 'Leistung', 'Ytelse', 'Prestanda', 'Ydelse', 'Prestazioni', 'Performance', 'Desempenho', 'Rendimiento'],
    'Hoog verbruik': ['High demand', 'Hoher Bedarf', 'Høyt forbruk', 'Hög förbrukning', 'Højt forbrug', 'Alta richiesta', 'Forte demande', 'Consumo elevado', 'Alta demanda'],
    'Warmtepomp': ['Heat pump', 'Wärmepumpe', 'Varmepumpe', 'Värmepump', 'Varmepumpe', 'Pompa di calore', 'Pompe à chaleur', 'Bomba de calor', 'Bomba de calor'],
    'Automatisch': ['Automatic', 'Automatisch', 'Automatisk', 'Automatiskt', 'Automatisk', 'Automatico', 'Automatique', 'Automático', 'Automático'],
    'Verwarmen': ['Heating', 'Heizen', 'Varmer', 'Värmer', 'Varmer', 'Riscaldamento', 'Chauffage', 'Aquecimento', 'Calefacción'],
    'Koelen': ['Cooling', 'Kühlen', 'Kjøler', 'Kyler', 'Køler', 'Raffreddamento', 'Refroidissement', 'Arrefecimento', 'Refrigeración'],
    'Laden': ['Charging', 'Laden', 'Lader', 'Laddar', 'Lader', 'In carica', 'En charge', 'A carregar', 'Cargando'],
    'Ontladen': ['Discharging', 'Entladen', 'Utlader', 'Urladdar', 'Aflader', 'In scarica', 'En décharge', 'A descarregar', 'Descargando'],
    'Gepauzeerd': ['Paused', 'Pausiert', 'På pause', 'Pausad', 'På pause', 'In pausa', 'En pause', 'Em pausa', 'En pausa'],
    'Aangesloten': ['Plugged in', 'Angeschlossen', 'Tilkoblet', 'Ansluten', 'Tilsluttet', 'Collegato', 'Branché', 'Ligado', 'Conectado'],
    'Niet aangesloten': ['Not plugged in', 'Nicht angeschlossen', 'Ikke tilkoblet', 'Inte ansluten', 'Ikke tilsluttet', 'Non collegato', 'Non branché', 'Não ligado', 'No conectado'],
    'Niet aan het laden': ['Not charging', 'Lädt nicht', 'Lader ikke', 'Laddar inte', 'Lader ikke', 'Non in carica', 'Pas en charge', 'Não está a carregar', 'No está cargando'],

    // Heating, EV charger and home battery
    'Geen warmtepomp, cv-ketel of thermostaat gevonden. Kies ze bij de instellingen.': [
      'No heat pump, central heating boiler or thermostat found. Choose them in the settings.',
      'Keine Wärmepumpe, kein Heizkessel und kein Thermostat gefunden. Wähle sie in den Einstellungen.',
      'Ingen varmepumpe, kjele eller termostat funnet. Velg dem i innstillingene.',
      'Ingen värmepump, panna eller termostat hittades. Välj dem i inställningarna.',
      'Ingen varmepumpe, kedel eller termostat fundet. Vælg dem i indstillingerne.',
      'Nessuna pompa di calore, caldaia o termostato trovati. Sceglili nelle impostazioni.',
      'Aucune pompe à chaleur, chaudière ou thermostat trouvé. Choisissez-les dans les réglages.',
      'Nenhuma bomba de calor, caldeira ou termóstato encontrado. Escolha-os nas definições.',
      'No se encontró ninguna bomba de calor, caldera ni termostato. Elígelos en los ajustes.'],
    'Geen laadpaal gevonden. Kies er een bij de instellingen.': ['No EV charger found. Choose one in the settings.', 'Keine Wallbox gefunden. Wähle eine in den Einstellungen.', 'Ingen elbillader funnet. Velg en i innstillingene.', 'Ingen laddbox hittades. Välj en i inställningarna.', 'Ingen ladeboks fundet. Vælg en i indstillingerne.', 'Nessuna wallbox trovata. Scegline una nelle impostazioni.', 'Aucune borne de recharge trouvée. Choisissez-en une dans les réglages.', 'Nenhum carregador VE encontrado. Escolha um nas definições.', 'No se encontró ningún cargador VE. Elige uno en los ajustes.'],
    'Laadpalen': ['EV chargers', 'Wallboxen', 'Elbilladere', 'Laddboxar', 'Ladebokse', 'Wallbox', 'Bornes de recharge', 'Carregadores VE', 'Cargadores VE'],
    'Thuisbatterij': ['Home battery', 'Heimspeicher', 'Hjemmebatteri', 'Hembatteri', 'Hjemmebatteri', 'Batteria domestica', 'Batterie domestique', 'Bateria doméstica', 'Batería doméstica'],
    'Geen thuisbatterij gevonden. Kies er een bij de instellingen.': ['No home battery found. Choose one in the settings.', 'Kein Heimspeicher gefunden. Wähle einen in den Einstellungen.', 'Ingen hjemmebatteri funnet. Velg ett i innstillingene.', 'Inget hembatteri hittades. Välj ett i inställningarna.', 'Intet hjemmebatteri fundet. Vælg et i indstillingerne.', 'Nessuna batteria domestica trovata. Scegline una nelle impostazioni.', 'Aucune batterie domestique trouvée. Choisissez-en une dans les réglages.', 'Nenhuma bateria doméstica encontrada. Escolha uma nas definições.', 'No se encontró ninguna batería doméstica. Elige una en los ajustes.'],
    'Rust': ['Idle', 'Ruhe', 'Hvile', 'Vila', 'Hvile', 'Inattiva', 'Au repos', 'Em repouso', 'En reposo'],
    'laadniveau': ['charge level', 'Ladestand', 'ladenivå', 'laddnivå', 'ladeniveau', 'livello di carica', 'niveau de charge', 'nível de carga', 'nivel de carga'],
    'Laadniveau': ['Charge level', 'Ladestand', 'Ladenivå', 'Laddnivå', 'Ladeniveau', 'Livello di carica', 'Niveau de charge', 'Nível de carga', 'Nivel de carga'],
    'Laadniveau vandaag': ['Charge level today', 'Ladestand heute', 'Ladenivå i dag', 'Laddnivå idag', 'Ladeniveau i dag', 'Livello di carica oggi', 'Niveau de charge aujourd\'hui', 'Nível de carga hoje', 'Nivel de carga hoy'],
    'Rendement': ['Efficiency', 'Wirkungsgrad', 'Virkningsgrad', 'Verkningsgrad', 'Virkningsgrad', 'Efficienza', 'Rendement', 'Eficiência', 'Eficiencia'],
    'Geladen met zon': ['Charged from solar', 'Mit Solarstrom geladen', 'Ladet med sol', 'Laddat med sol', 'Opladet med sol', 'Caricata dal solare', 'Chargée au solaire', 'Carregada com solar', 'Cargada con solar'],
    'Zonder salderen (vanaf 2027)': ['Without net metering (from 2027)', 'Ohne Saldierung (ab 2027)', 'Uten nettomåling (fra 2027)', 'Utan kvittning (från 2027)', 'Uden nettoafregning (fra 2027)', 'Senza scambio sul posto (dal 2027)', 'Sans compensation (à partir de 2027)', 'Sem compensação (a partir de 2027)', 'Sin compensación (desde 2027)'],
    'Zonprestatie': ['Solar performance', 'Solarleistung', 'Solytelse', 'Solprestanda', 'Solydelse', 'Resa solare', 'Performance solaire', 'Desempenho solar', 'Rendimiento solar'],
    'Gas per graaddag': ['Gas per degree day', 'Gas pro Gradtag', 'Gass per graddag', 'Gas per graddag', 'Gas pr. graddag', 'Gas per grado giorno', 'Gaz par degré-jour', 'Gás por grau-dia', 'Gas por grado-día'],
    'kWh opgewekt': ['kWh produced', 'kWh erzeugt', 'kWh produsert', 'kWh producerat', 'kWh produceret', 'kWh prodotti', 'kWh produits', 'kWh produzidos', 'kWh producidos'],
    'Verwacht': ['Expected', 'Erwartet', 'Forventet', 'Förväntat', 'Forventet', 'Previsto', 'Prévu', 'Previsto', 'Previsto'],
    'Verwacht tot nu': ['Expected so far', 'Bisher erwartet', 'Forventet så langt', 'Förväntat hittills', 'Forventet indtil nu', 'Previsto finora', 'Prévu jusqu\'ici', 'Previsto até agora', 'Previsto hasta ahora'],
    'Verwacht vandaag': ['Expected today', 'Heute erwartet', 'Forventet i dag', 'Förväntat idag', 'Forventet i dag', 'Previsto oggi', 'Prévu aujourd\'hui', 'Previsto hoje', 'Previsto hoy'],
    'Prestatie t.o.v. verwachting': ['Performance vs forecast', 'Leistung gegenüber Prognose', 'Ytelse mot prognose', 'Prestanda mot prognos', 'Ydelse i forhold til prognose', 'Resa rispetto alla previsione', 'Performance par rapport à la prévision', 'Desempenho face à previsão', 'Rendimiento frente a la previsión'],
    'Per kWp': ['Per kWp', 'Pro kWp', 'Per kWp', 'Per kWp', 'Pr. kWp', 'Per kWp', 'Par kWc', 'Por kWp', 'Por kWp'],
    'aan het laden': ['charging', 'lädt', 'lader', 'laddar', 'lader', 'in carica', 'en charge', 'a carregar', 'cargando'],
    'vermogen': ['power', 'Leistung', 'effekt', 'effekt', 'effekt', 'potenza', 'puissance', 'potência', 'potencia'],
    'Accu auto': ['Car battery', 'Autobatterie', 'Bilbatteri', 'Bilbatteri', 'Bilbatteri', 'Batteria auto', 'Batterie voiture', 'Bateria do carro', 'Batería del coche'],

    // Totals and charts
    'Verbruik': ['Consumption', 'Verbrauch', 'Forbruk', 'Förbrukning', 'Forbrug', 'Consumo', 'Consommation', 'Consumo', 'Consumo'],
    'Van het net': ['From grid', 'Aus dem Netz', 'Fra nettet', 'Från nätet', 'Fra nettet', 'Dalla rete', 'Du réseau', 'Da rede', 'De la red'],
    'Zon opgewekt': ['Solar produced', 'Solar erzeugt', 'Sol produsert', 'Sol producerad', 'Sol produceret', 'Solare prodotto', 'Solaire produit', 'Solar produzida', 'Solar producida'],
    'Terug': ['Export', 'Einspeisung', 'Eksport', 'Export', 'Eksport', 'Immissione', 'Injection', 'Injeção', 'Inyección'],
    'Teruggeleverd': ['Exported', 'Eingespeist', 'Eksportert', 'Exporterat', 'Eksporteret', 'Immessa', 'Injecté', 'Injetada', 'Inyectada'],
    'Teruglevering': ['Export', 'Einspeisung', 'Eksport', 'Export', 'Eksport', 'Immissione', 'Injection', 'Injeção', 'Inyección'],
    'Zelf': ['Self', 'Selbst', 'Selv', 'Själv', 'Selv', 'Auto', 'Auto', 'Próprio', 'Propio'],
    'Zelfvoorzienend': ['Self-sufficient', 'Autarkie', 'Selvforsynt', 'Självförsörjande', 'Selvforsynende', 'Autosufficienza', 'Autonomie', 'Autossuficiente', 'Autosuficiente'],
    'Geladen': ['Charged', 'Geladen', 'Ladet', 'Laddat', 'Opladet', 'Caricata', 'Chargé', 'Carregada', 'Cargada'],
    'Batterij geladen': ['Battery charged', 'Batterie geladen', 'Batteri ladet', 'Batteri laddat', 'Batteri opladet', 'Batteria caricata', 'Batterie chargée', 'Bateria carregada', 'Batería cargada'],
    'Batterij ontladen': ['Battery discharged', 'Batterie entladen', 'Batteri utladet', 'Batteri urladdat', 'Batteri afladet', 'Batteria scaricata', 'Batterie déchargée', 'Bateria descarregada', 'Batería descargada'],
    'Batterij laden': ['Battery charging', 'Batterie laden', 'Batterilading', 'Batteriladdning', 'Batteriopladning', 'Carica batteria', 'Charge batterie', 'Carregar bateria', 'Carga de batería'],
    'Eigen zon gebruikt': ['Own solar used', 'Eigener Solarstrom genutzt', 'Egen sol brukt', 'Egen sol använd', 'Egen sol brugt', 'Solare proprio usato', 'Solaire autoconsommé', 'Solar própria usada', 'Solar propia usada'],
    'Zon direct': ['Solar direct', 'Solar direkt', 'Sol direkte', 'Sol direkt', 'Sol direkte', 'Solare diretto', 'Solaire direct', 'Solar direta', 'Solar directa'],
    'Uit batterij': ['From battery', 'Aus Batterie', 'Fra batteri', 'Från batteri', 'Fra batteri', 'Dalla batteria', 'De la batterie', 'Da bateria', 'De la batería'],
    'Zon in batterij': ['Solar to battery', 'Solar in Batterie', 'Sol til batteri', 'Sol till batteri', 'Sol til batteri', 'Solare in batteria', 'Solaire vers batterie', 'Solar para bateria', 'Solar a batería'],
    'Zelfverbruik': ['Self-consumption', 'Eigenverbrauch', 'Egenforbruk', 'Egenförbrukning', 'Egetforbrug', 'Autoconsumo', 'Autoconsommation', 'Autoconsumo', 'Autoconsumo'],
    'Verwachte zon': ['Expected solar', 'Erwarteter Solarertrag', 'Forventet sol', 'Förväntad sol', 'Forventet sol', 'Solare previsto', 'Solaire prévu', 'Solar prevista', 'Solar prevista'],
    'Opgewekt': ['Produced', 'Erzeugt', 'Produsert', 'Producerat', 'Produceret', 'Prodotto', 'Produit', 'Produzido', 'Producido'],
    'Stroom verwarming': ['Heating electricity', 'Heizstrom', 'Strøm til oppvarming', 'El till uppvärmning', 'Strøm til opvarmning', 'Elettricità riscaldamento', 'Électricité chauffage', 'Eletricidade aquecimento', 'Electricidad calefacción'],
    '= gelijk': ['= same', '= gleich', '= likt', '= lika', '= samme', '= uguale', '= identique', '= igual', '= igual'],
    'vorige periode': ['previous period', 'vorheriger Zeitraum', 'forrige periode', 'föregående period', 'forrige periode', 'periodo precedente', 'période précédente', 'período anterior', 'periodo anterior'],
    'gisteren tot hetzelfde uur': ['yesterday up to the same hour', 'gestern bis zur selben Stunde', 'i går til samme time', 'igår till samma timme', 'i går til samme time', 'ieri fino alla stessa ora', 'hier jusqu\'à la même heure', 'ontem até à mesma hora', 'ayer hasta la misma hora'],
    'vorige week tot dezelfde dag': ['last week up to the same day', 'letzte Woche bis zum selben Tag', 'forrige uke til samme dag', 'förra veckan till samma dag', 'sidste uge til samme dag', 'la settimana scorsa fino allo stesso giorno', 'la semaine dernière jusqu\'au même jour', 'a semana passada até ao mesmo dia', 'la semana pasada hasta el mismo día'],
    'vorige maand tot dezelfde dag': ['last month up to the same day', 'letzten Monat bis zum selben Tag', 'forrige måned til samme dag', 'förra månaden till samma dag', 'sidste måned til samme dag', 'il mese scorso fino allo stesso giorno', 'le mois dernier jusqu\'au même jour', 'o mês passado até ao mesmo dia', 'el mes pasado hasta el mismo día'],
    'Geen vermogensgegevens van de P1-meter': ['No power data from the P1 meter', 'Keine Leistungsdaten vom P1-Zähler', 'Ingen effektdata fra P1-måleren', 'Inga effektdata från P1-mätaren', 'Ingen effektdata fra P1-måleren', 'Nessun dato di potenza dal contatore P1', 'Aucune donnée de puissance du compteur P1', 'Sem dados de potência do contador P1', 'Sin datos de potencia del contador P1'],

    // Energy flows
    'nu · W': ['now · W', 'jetzt · W', 'nå · W', 'nu · W', 'nu · W', 'ora · W', 'maintenant · W', 'agora · W', 'ahora · W'],
    'Nu geen energiestroom gemeten': ['No energy flow measured right now', 'Derzeit kein Energiefluss gemessen', 'Ingen energiflyt målt akkurat nå', 'Inget energiflöde uppmätt just nu', 'Ingen energistrøm målt lige nu', 'Nessun flusso di energia misurato al momento', 'Aucun flux d\'énergie mesuré pour l\'instant', 'Nenhum fluxo de energia medido neste momento', 'Ningún flujo de energía medido ahora mismo'],
    'Niet gemeten': ['Not measured', 'Nicht gemessen', 'Ikke målt', 'Inte uppmätt', 'Ikke målt', 'Non misurato', 'Non mesuré', 'Não medido', 'No medido'],
    'Energiestromen van bron naar verbruiker': ['Energy flows from source to consumer', 'Energieflüsse von der Quelle zum Verbraucher', 'Energiflyt fra kilde til forbruker', 'Energiflöden från källa till förbrukare', 'Energistrømme fra kilde til forbruger', 'Flussi di energia dalla fonte all\'utenza', 'Flux d\'énergie de la source au consommateur', 'Fluxos de energia da fonte ao consumidor', 'Flujos de energía de la fuente al consumidor'],

    // Prices
    'Geen prijzen beschikbaar.': ['No prices available.', 'Keine Preise verfügbar.', 'Ingen priser tilgjengelig.', 'Inga priser tillgängliga.', 'Ingen priser tilgængelige.', 'Nessun prezzo disponibile.', 'Aucun prix disponible.', 'Sem preços disponíveis.', 'No hay precios disponibles.'],
    'per kWh nu': ['per kWh now', 'pro kWh jetzt', 'per kWh nå', 'per kWh nu', 'pr. kWh nu', 'per kWh ora', 'par kWh maintenant', 'por kWh agora', 'por kWh ahora'],
    'Laagste vandaag': ['Lowest today', 'Niedrigster heute', 'Lavest i dag', 'Lägst idag', 'Lavest i dag', 'Minimo oggi', 'Le plus bas aujourd\'hui', 'Mais baixo hoje', 'Más bajo hoy'],
    'Hoogste vandaag': ['Highest today', 'Höchster heute', 'Høyest i dag', 'Högst idag', 'Højest i dag', 'Massimo oggi', 'Le plus haut aujourd\'hui', 'Mais alto hoje', 'Más alto hoy'],
    'Gemiddeld vandaag': ['Average today', 'Durchschnitt heute', 'Snitt i dag', 'Snitt idag', 'Gennemsnit i dag', 'Media oggi', 'Moyenne aujourd\'hui', 'Média hoje', 'Media hoy'],
    'morgen': ['tmrw', 'morgen', 'i morgen', 'imorgon', 'i morgen', 'domani', 'demain', 'amanhã', 'mañana'],
    'Prijzen ophalen duurde te lang': ['Loading prices took too long', 'Preise laden dauerte zu lange', 'Henting av priser tok for lang tid', 'Att hämta priser tog för lång tid', 'Hentning af priser tog for lang tid', 'Il caricamento dei prezzi ha richiesto troppo tempo', 'Le chargement des prix a pris trop de temps', 'Carregar os preços demorou demasiado', 'La carga de precios tardó demasiado'],
    'Goedkoopste 1 uur': ['Cheapest hour', 'Günstigste Stunde', 'Billigste time', 'Billigaste timmen', 'Billigste time', 'Ora più economica', 'Heure la moins chère', 'Hora mais barata', 'Hora más barata'],

    // Key figures, devices, costs
    'kWh netto geleverd': ['kWh net exported', 'kWh netto eingespeist', 'kWh netto eksportert', 'kWh netto exporterat', 'kWh netto eksporteret', 'kWh netti immessi', 'kWh nets injectés', 'kWh líquidos injetados', 'kWh netos inyectados'],
    'kWh netto afgenomen': ['kWh net imported', 'kWh netto bezogen', 'kWh netto importert', 'kWh netto importerat', 'kWh netto importeret', 'kWh netti prelevati', 'kWh nets soutirés', 'kWh líquidos consumidos', 'kWh netos consumidos'],
    'Geen apparaten met een kWh-meter gevonden': ['No devices with a kWh meter found', 'Keine Geräte mit kWh-Zähler gefunden', 'Ingen enheter med kWh-måler funnet', 'Inga enheter med kWh-mätare hittades', 'Ingen enheder med kWh-måler fundet', 'Nessun dispositivo con contatore kWh trovato', 'Aucun appareil avec compteur kWh trouvé', 'Nenhum dispositivo com contador kWh encontrado', 'No se encontró ningún dispositivo con contador kWh'],
    'Geen apparaten met stroommeting actief': ['No devices with power metering active', 'Keine Geräte mit aktiver Leistungsmessung', 'Ingen enheter med aktiv effektmåling', 'Inga enheter med aktiv effektmätning', 'Ingen enheder med aktiv effektmåling', 'Nessun dispositivo con misura di potenza attiva', 'Aucun appareil avec mesure de puissance active', 'Nenhum dispositivo com medição de potência ativa', 'Ningún dispositivo con medición de potencia activa'],
    'Vul je tarieven in bij de instellingen om de kosten te zien.': ['Enter your tariffs in the settings to see the costs.', 'Trage deine Tarife in den Einstellungen ein, um die Kosten zu sehen.', 'Fyll inn tariffene dine i innstillingene for å se kostnadene.', 'Fyll i dina priser i inställningarna för att se kostnaderna.', 'Udfyld dine takster i indstillingerne for at se omkostningerne.', 'Inserisci le tue tariffe nelle impostazioni per vedere i costi.', 'Saisissez vos tarifs dans les réglages pour voir les coûts.', 'Introduza as suas tarifas nas definições para ver os custos.', 'Introduce tus tarifas en los ajustes para ver los costes.'],
    'Stroom afname': ['Electricity import', 'Strombezug', 'Kjøpt strøm', 'Köpt el', 'Købt strøm', 'Prelievo di elettricità', 'Électricité soutirée', 'Eletricidade consumida', 'Electricidad consumida'],
    'Totaal': ['Total', 'Gesamt', 'Totalt', 'Totalt', 'I alt', 'Totale', 'Total', 'Total', 'Total'],

    // Water, standby use, phases
    'Geen watermeter gevonden. Kies er een bij de instellingen.': ['No water meter found. Choose one in the settings.', 'Kein Wasserzähler gefunden. Wähle einen in den Einstellungen.', 'Ingen vannmåler funnet. Velg en i innstillingene.', 'Ingen vattenmätare hittades. Välj en i inställningarna.', 'Ingen vandmåler fundet. Vælg en i indstillingerne.', 'Nessun contatore dell\'acqua trovato. Scegline uno nelle impostazioni.', 'Aucun compteur d\'eau trouvé. Choisissez-en un dans les réglages.', 'Nenhum contador de água encontrado. Escolha um nas definições.', 'No se encontró ningún contador de agua. Elige uno en los ajustes.'],
    'vannacht': ['last night', 'letzte Nacht', 'i natt', 'i natt', 'i nat', 'stanotte', 'cette nuit', 'esta noite', 'anoche'],
    'Nog niet bekend. Dit wordt berekend uit het verbruik van afgelopen nacht.': ['Not known yet. This is calculated from last night\'s use.', 'Noch nicht bekannt. Wird aus dem Verbrauch der letzten Nacht berechnet.', 'Ikke kjent ennå. Dette beregnes ut fra forbruket i natt.', 'Inte känt ännu. Det beräknas från förbrukningen i natt.', 'Endnu ikke kendt. Det beregnes ud fra forbruget i nat.', 'Non ancora noto. Viene calcolato dal consumo della notte scorsa.', 'Pas encore connu. Calculé à partir de la consommation de la nuit dernière.', 'Ainda não conhecido. É calculado a partir do consumo da noite passada.', 'Aún no se conoce. Se calcula a partir del consumo de anoche.'],
    'altijd aan': ['always on', 'immer an', 'alltid på', 'alltid på', 'altid tændt', 'sempre acceso', 'toujours allumé', 'sempre ligado', 'siempre encendido'],
    'Per jaar': ['Per year', 'Pro Jahr', 'Per år', 'Per år', 'Pr. år', 'All\'anno', 'Par an', 'Por ano', 'Por año'],
    'Kost per jaar': ['Cost per year', 'Kosten pro Jahr', 'Kostnad per år', 'Kostnad per år', 'Pris pr. år', 'Costo annuo', 'Coût par an', 'Custo por ano', 'Coste por año'],
    'Gemeten': ['Measured', 'Gemessen', 'Målt', 'Uppmätt', 'Målt', 'Misurato', 'Mesuré', 'Medido', 'Medido'],
    'vannacht 1:00–5:00': ['last night 1:00–5:00', 'letzte Nacht 1:00–5:00', 'i natt 1:00–5:00', 'i natt 1:00–5:00', 'i nat 1:00–5:00', 'stanotte 1:00–5:00', 'cette nuit 1:00–5:00', 'esta noite 1:00–5:00', 'anoche 1:00–5:00'],
    'Je slimme meter geeft geen waarden per fase door.': ['Your smart meter does not report values per phase.', 'Dein Smart Meter liefert keine Werte pro Phase.', 'Den smarte måleren din sender ikke verdier per fase.', 'Din smarta elmätare rapporterar inga värden per fas.', 'Din smarte måler sender ikke værdier pr. fase.', 'Il tuo contatore intelligente non fornisce valori per fase.', 'Votre compteur communicant ne transmet pas de valeurs par phase.', 'O seu contador inteligente não envia valores por fase.', 'Tu contador inteligente no envía valores por fase.'],

    // Messages
    'P1-meter': ['P1 meter', 'P1-Zähler', 'P1-måler', 'P1-mätare', 'P1-måler', 'contatore P1', 'compteur P1', 'contador P1', 'contador P1'],
    'zonnepanelen': ['solar panels', 'Solarmodule', 'solcellepaneler', 'solpaneler', 'solpaneler', 'pannelli solari', 'panneaux solaires', 'painéis solares', 'paneles solares'],
    'boiler': ['water heater', 'Warmwasserspeicher', 'varmtvannsbereder', 'varmvattenberedare', 'varmtvandsbeholder', 'scaldabagno', 'chauffe-eau', 'termoacumulador', 'calentador'],
    'Demo-modus.': ['Demo mode.', 'Demo-Modus.', 'Demomodus.', 'Demoläge.', 'Demotilstand.', 'Modalità demo.', 'Mode démo.', 'Modo demo.', 'Modo demo.'],
    'Je ziet voorbeelddata. Vul': ['You are looking at sample data. Fill in', 'Du siehst Beispieldaten. Trage in', 'Du ser eksempeldata. Fyll ut', 'Du ser exempeldata. Fyll i', 'Du ser eksempeldata. Udfyld', 'Stai vedendo dati di esempio. Compila', 'Vous voyez des données d\'exemple. Complétez', 'Está a ver dados de exemplo. Preencha', 'Estás viendo datos de ejemplo. Completa'],
    'in met het adres en de API-key van je Homey Pro en start de server opnieuw.': [
      'with the address and API key of your Homey Pro and restart the server.',
      'die Adresse und den API-Schlüssel deines Homey Pro ein und starte den Server neu.',
      'med adressen og API-nøkkelen til Homey Pro og start serveren på nytt.',
      'med adressen och API-nyckeln för din Homey Pro och starta om servern.',
      'med adressen og API-nøglen til din Homey Pro og genstart serveren.',
      'con l\'indirizzo e la chiave API del tuo Homey Pro e riavvia il server.',
      'avec l\'adresse et la clé API de votre Homey Pro et redémarrez le serveur.',
      'com o endereço e a chave API do seu Homey Pro e reinicie o servidor.',
      'con la dirección y la clave API de tu Homey Pro y reinicia el servidor.'],
    'Zet de apparaat-id\'s in': ['Put the device IDs in', 'Trage die Geräte-IDs in', 'Legg enhets-ID-ene i', 'Lägg enhets-id:na i', 'Sæt enheds-id\'erne i', 'Inserisci gli ID dei dispositivi in', 'Mettez les ID des appareils dans', 'Coloque os IDs dos dispositivos em', 'Pon los ID de los dispositivos en'],
    '(zie': ['(see', '(siehe', '(se', '(se', '(se', '(vedi', '(voir', '(ver', '(ver'],
    'Kies ze in de Homey-app bij': ['Choose them in the Homey app under', 'Wähle sie in der Homey-App unter', 'Velg dem i Homey-appen under', 'Välj dem i Homey-appen under', 'Vælg dem i Homey-appen under', 'Sceglili nell\'app Homey in', 'Choisissez-les dans l\'app Homey sous', 'Escolha-os na app Homey em', 'Elígelos en la app de Homey en'],
    'Apps → Energie Dashboard → Instellingen': ['Apps → Energy Dashboard → Settings', 'Apps → Energy Dashboard → Einstellungen', 'Apper → Energy Dashboard → Innstillinger', 'Appar → Energy Dashboard → Inställningar', 'Apps → Energy Dashboard → Indstillinger', 'App → Energy Dashboard → Impostazioni', 'Applications → Energy Dashboard → Réglages', 'Apps → Energy Dashboard → Definições', 'Apps → Energy Dashboard → Ajustes'],
    'Kies minstens één blok': ['Choose at least one block', 'Wähle mindestens einen Block', 'Velg minst én blokk', 'Välj minst ett block', 'Vælg mindst én blok', 'Scegli almeno un blocco', 'Choisissez au moins un bloc', 'Escolha pelo menos um bloco', 'Elige al menos un bloque'],
    'Verkeerde pincode': ['Wrong PIN', 'Falsche PIN', 'Feil PIN-kode', 'Fel PIN-kod', 'Forkert pinkode', 'PIN errato', 'Code PIN incorrect', 'PIN errado', 'PIN incorrecto'],
    'Te veel verkeerde pincodes. Probeer het over een minuut opnieuw.': ['Too many wrong PINs. Try again in a minute.', 'Zu viele falsche PINs. Versuche es in einer Minute erneut.', 'For mange feil PIN-koder. Prøv igjen om ett minutt.', 'För många felaktiga PIN-koder. Försök igen om en minut.', 'For mange forkerte pinkoder. Prøv igen om et minut.', 'Troppi PIN errati. Riprova tra un minuto.', 'Trop de codes PIN incorrects. Réessayez dans une minute.', 'Demasiados PIN errados. Tente novamente dentro de um minuto.', 'Demasiados PIN incorrectos. Inténtalo de nuevo dentro de un minuto.'],
    'Te veel gegevens': ['Too much data', 'Zu viele Daten', 'For mye data', 'För mycket data', 'For mange data', 'Troppi dati', 'Trop de données', 'Demasiados dados', 'Demasiados datos'],
    'Ongeldige gegevens': ['Invalid data', 'Ungültige Daten', 'Ugyldige data', 'Ogiltiga data', 'Ugyldige data', 'Dati non validi', 'Données non valides', 'Dados inválidos', 'Datos no válidos'],
    'Ongeldig adres': ['Invalid address', 'Ungültige Adresse', 'Ugyldig adresse', 'Ogiltig adress', 'Ugyldig adresse', 'Indirizzo non valido', 'Adresse non valide', 'Endereço inválido', 'Dirección no válida'],
    'Niet gevonden': ['Not found', 'Nicht gefunden', 'Ikke funnet', 'Hittades inte', 'Ikke fundet', 'Non trovato', 'Introuvable', 'Não encontrado', 'No encontrado'],
    'Toegangscode nodig': ['Access code required', 'Zugangscode erforderlich', 'Tilgangskode kreves', 'Åtkomstkod krävs', 'Adgangskode påkrævet', 'Codice di accesso richiesto', 'Code d\'accès requis', 'Código de acesso necessário', 'Se requiere código de acceso'],

    // Warnings
    'Meldingen': ['Warnings', 'Meldungen', 'Varsler', 'Aviseringar', 'Advarsler', 'Avvisi', 'Alertes', 'Alertas', 'Avisos'],
    'Geen meldingen': ['No warnings', 'Keine Meldungen', 'Ingen varsler', 'Inga aviseringar', 'Ingen advarsler', 'Nessun avviso', 'Aucune alerte', 'Sem alertas', 'Sin avisos'],

    // End of net metering
    'Einde salderen': ['End of net metering', 'Ende der Saldierung', 'Slutt på nettomåling', 'Slut på kvittning', 'Ophør af nettoafregning', 'Fine dello scambio sul posto', 'Fin de la compensation', 'Fim da compensação', 'Fin de la compensación'],
    'per jaar extra vanaf 2027': ['extra per year from 2027', 'pro Jahr mehr ab 2027', 'ekstra per år fra 2027', 'extra per år från 2027', 'ekstra pr. år fra 2027', 'in più all\'anno dal 2027', 'en plus par an à partir de 2027', 'a mais por ano a partir de 2027', 'más al año desde 2027'],
    'op basis van vorig jaar': ['based on last year', 'auf Basis des Vorjahres', 'basert på i fjor', 'baserat på förra året', 'baseret på sidste år', 'in base all\'anno scorso', 'sur la base de l\'an dernier', 'com base no ano passado', 'según el año pasado'],
    'op basis van dit jaar tot nu': ['based on this year so far', 'auf Basis dieses Jahres bis jetzt', 'basert på i år så langt', 'baserat på i år hittills', 'baseret på i år indtil nu', 'in base a quest\'anno finora', 'sur la base de cette année jusqu\'ici', 'com base neste ano até agora', 'según este año hasta ahora'],
    'Daarvan gesaldeerd': ['Of which netted', 'Davon saldiert', 'Herav avregnet', 'Varav kvittat', 'Heraf modregnet', 'Di cui compensati', 'Dont compensés', 'Dos quais compensados', 'De los cuales compensados'],
    'Elke kWh die je zelf gebruikt in plaats van teruglevert, bespaart': ['Each kWh you use yourself instead of exporting saves', 'Jede kWh, die du selbst nutzt statt einzuspeisen, spart', 'Hver kWh du bruker selv i stedet for å eksportere, sparer', 'Varje kWh du använder själv i stället för att exportera sparar', 'Hver kWh, du selv bruger i stedet for at eksportere, sparer', 'Ogni kWh che usi tu invece di immetterlo fa risparmiare', 'Chaque kWh que vous consommez au lieu de l\'injecter fait économiser', 'Cada kWh que usa em vez de injetar poupa', 'Cada kWh que usas tú en lugar de inyectarlo ahorra'],
    'Nog geen teruglevering gemeten.': ['No export measured yet.', 'Noch keine Einspeisung gemessen.', 'Ingen eksport målt ennå.', 'Ingen export uppmätt ännu.', 'Ingen eksport målt endnu.', 'Nessuna immissione misurata finora.', 'Aucune injection mesurée pour l\'instant.', 'Ainda nenhuma injeção medida.', 'Aún no se ha medido ninguna inyección.'],
    'Vul je stroomcontract in bij de instellingen om dit te berekenen.': ['Fill in your electricity contract in the settings to calculate this.', 'Trage deinen Stromvertrag in den Einstellungen ein, um dies zu berechnen.', 'Fyll inn strømavtalen din i innstillingene for å beregne dette.', 'Fyll i ditt elavtal i inställningarna för att beräkna detta.', 'Udfyld din elaftale i indstillingerne for at beregne dette.', 'Inserisci il tuo contratto di elettricità nelle impostazioni per calcolarlo.', 'Saisissez votre contrat d\'électricité dans les réglages pour le calculer.', 'Introduza o seu contrato de eletricidade nas definições para calcular isto.', 'Introduce tu contrato de luz en los ajustes para calcularlo.'],
    'Salderen stopt op 1 januari 2027. Daarna betaal je voor alles wat je van het net haalt, en krijg je voor teruglevering alleen de terugleververgoeding. Meer zelf gebruiken op zonnige uren of een thuisbatterij verkleint dit bedrag. Berekend met je contract uit de instellingen.': [
      'Net metering (salderen) ends on 1 January 2027. From then on you pay for everything you take from the grid, and export only earns the export compensation. Using more yourself in sunny hours or a home battery makes this amount smaller. Calculated with your contract from the settings.',
      'Die niederländische Saldierung (salderen) endet am 1. Januar 2027. Danach zahlst du für alles, was du aus dem Netz beziehst, und für die Einspeisung erhältst du nur noch die Einspeisevergütung. Mehr Eigenverbrauch in sonnigen Stunden oder ein Heimspeicher verringert diesen Betrag. Berechnet mit deinem Vertrag aus den Einstellungen.',
      'Den nederlandske nettomålingen (salderen) opphører 1. januar 2027. Deretter betaler du for alt du henter fra nettet, og for eksport får du bare eksportgodtgjørelsen. Å bruke mer selv i solrike timer eller et hjemmebatteri gjør beløpet mindre. Beregnet med avtalen din fra innstillingene.',
      'Den nederländska kvittningen (salderen) upphör den 1 januari 2027. Därefter betalar du för allt du tar från nätet, och för export får du bara ersättningen för såld el. Att använda mer själv under soliga timmar eller ett hembatteri minskar beloppet. Beräknat med ditt avtal från inställningarna.',
      'Den nederlandske nettoafregning (salderen) ophører 1. januar 2027. Derefter betaler du for alt, du henter fra nettet, og eksport giver kun afregningsprisen. At bruge mere selv i solrige timer eller et hjemmebatteri gør beløbet mindre. Beregnet med din aftale fra indstillingerne.',
      'Lo scambio sul posto olandese (salderen) termina il 1° gennaio 2027. Da allora paghi tutto ciò che prelevi dalla rete e per l\'immissione ricevi solo il compenso di immissione. Usare più energia nelle ore di sole o una batteria domestica riduce questo importo. Calcolato con il tuo contratto dalle impostazioni.',
      'La compensation néerlandaise (salderen) prend fin le 1er janvier 2027. Ensuite, vous payez tout ce que vous prélevez sur le réseau et l\'injection ne rapporte que la rémunération d\'injection. Consommer davantage aux heures ensoleillées ou une batterie domestique réduit ce montant. Calculé avec votre contrat des réglages.',
      'A compensação neerlandesa (salderen) termina a 1 de janeiro de 2027. A partir daí paga tudo o que retira da rede, e a injeção só rende a tarifa de injeção. Usar mais nas horas de sol ou uma bateria doméstica reduz este valor. Calculado com o seu contrato das definições.',
      'La compensación neerlandesa (salderen) termina el 1 de enero de 2027. A partir de entonces pagas todo lo que tomas de la red y la inyección solo recibe la compensación por inyección. Consumir más en las horas de sol o una batería doméstica reduce este importe. Calculado con tu contrato de los ajustes.'],
    // Battery use
    'Batterijgebruik': ['Battery use', 'Batterienutzung', 'Batteribruk', 'Batterianvändning', 'Batteriforbrug', 'Uso della batteria', 'Utilisation de la batterie', 'Utilização da bateria', 'Uso de la batería'],
    'Naar huis': ['To home', 'Ins Haus', 'Til huset', 'Till huset', 'Til huset', 'Verso casa', 'Vers la maison', 'Para casa', 'A casa'],
    'Naar het net': ['To grid', 'Ins Netz', 'Til nettet', 'Till nätet', 'Til nettet', 'Verso la rete', 'Vers le réseau', 'Para a rede', 'A la red'],
    'Van de zon': ['From solar', 'Von der Sonne', 'Fra solen', 'Från solen', 'Fra solen', 'Dal sole', 'Du soleil', 'Do sol', 'Del sol'],
    'Laden kostte gemiddeld': ['Charging cost on average', 'Laden kostete im Schnitt', 'Lading kostet i snitt', 'Laddning kostade i snitt', 'Opladning kostede i gennemsnit', 'La carica è costata in media', 'La charge a coûté en moyenne', 'O carregamento custou em média', 'La carga costó de media'],
    'Ontladen bespaarde gemiddeld': ['Discharging saved on average', 'Entladen sparte im Schnitt', 'Utlading sparte i snitt', 'Urladdning sparade i snitt', 'Afladning sparede i gennemsnit', 'La scarica ha fatto risparmiare in media', 'La décharge a économisé en moyenne', 'A descarga poupou em média', 'La descarga ahorró de media'],
    'Verschil per kWh': ['Difference per kWh', 'Differenz pro kWh', 'Forskjell per kWh', 'Skillnad per kWh', 'Forskel pr. kWh', 'Differenza per kWh', 'Écart par kWh', 'Diferença por kWh', 'Diferencia por kWh'],
    'Geladen van de zon': ['Charged from solar', 'Mit Sonne geladen', 'Ladet fra solen', 'Laddat från solen', 'Opladet fra solen', 'Caricata dal sole', 'Chargée par le soleil', 'Carregada pelo sol', 'Cargada con el sol'],
    'Geladen van het net': ['Charged from grid', 'Aus dem Netz geladen', 'Ladet fra nettet', 'Laddat från nätet', 'Opladet fra nettet', 'Caricata dalla rete', 'Chargée sur le réseau', 'Carregada pela rede', 'Cargada de la red'],
    'Ontladen naar huis': ['Discharged to home', 'Ins Haus entladen', 'Utladet til huset', 'Urladdat till huset', 'Afladet til huset', 'Scaricata verso casa', 'Déchargée vers la maison', 'Descarregada para casa', 'Descargada a casa'],
    'Ontladen naar het net': ['Discharged to grid', 'Ins Netz entladen', 'Utladet til nettet', 'Urladdat till nätet', 'Afladet til nettet', 'Scaricata verso la rete', 'Déchargée vers le réseau', 'Descarregada para a rede', 'Descargada a la red'],
    'Laden van de zon kost de teruglevering die je daardoor misloopt; ontladen bespaart de prijs van stroom van het net.': [
      'Charging from solar costs the export you miss out on; discharging saves the price of power from the grid.',
      'Laden mit Sonne kostet die Einspeisevergütung, die dir dadurch entgeht; Entladen spart den Preis für Strom aus dem Netz.',
      'Lading fra solen koster eksporten du går glipp av; utlading sparer prisen på strøm fra nettet.',
      'Laddning från solen kostar den export du går miste om; urladdning sparar priset för el från nätet.',
      'Opladning fra solen koster den eksport, du går glip af; afladning sparer prisen på strøm fra nettet.',
      'Caricare dal sole costa l\'immissione a cui rinunci; scaricare fa risparmiare il prezzo della corrente di rete.',
      'Charger avec le soleil coûte l\'injection que vous perdez ; décharger économise le prix du courant du réseau.',
      'Carregar com o sol custa a injeção de que abdica; descarregar poupa o preço da eletricidade da rede.',
      'Cargar con el sol cuesta la inyección a la que renuncias; descargar ahorra el precio de la luz de la red.'],

    // Estimates and prices from Homey
    'geschat': ['estimated', 'geschätzt', 'anslått', 'uppskattad', 'anslået', 'stimato', 'estimé', 'estimado', 'estimado'],
    'all-in volgens Homey': ['all-in according to Homey', 'all-in laut Homey', 'alt inkl. ifølge Homey', 'allt inkl. enligt Homey', 'alt inkl. ifølge Homey', 'tutto incluso secondo Homey', 'tout compris selon Homey', 'tudo incluído segundo o Homey', 'todo incluido según Homey'],
    'marktprijs van Homey': ['market price from Homey', 'Marktpreis von Homey', 'markedspris fra Homey', 'marknadspris från Homey', 'markedspris fra Homey', 'prezzo di mercato da Homey', 'prix du marché de Homey', 'preço de mercado do Homey', 'precio de mercado de Homey'],

    // Monthly peak and phases through the day
    'Maandpiek': ['Monthly peak', 'Monatsspitze', 'Månedstopp', 'Månadstopp', 'Månedsspids', 'Picco mensile', 'Pic mensuel', 'Pico mensal', 'Pico mensual'],
    'volgens je meter': ['according to your meter', 'laut deinem Zähler', 'ifølge måleren din', 'enligt din mätare', 'ifølge din måler', 'secondo il tuo contatore', 'selon votre compteur', 'segundo o seu contador', 'según tu contador'],
    'gemeten': ['measured', 'gemessen', 'målt', 'uppmätt', 'målt', 'misurato', 'mesuré', 'medido', 'medido'],
    'hoogste kwartier deze maand': ['highest quarter hour this month', 'höchste Viertelstunde diesen Monat', 'høyeste kvarter denne måneden', 'högsta kvart denna månad', 'højeste kvarter denne måned', 'quarto d\'ora più alto di questo mese', 'quart d\'heure le plus élevé ce mois-ci', 'quarto de hora mais alto este mês', 'cuarto de hora más alto este mes'],
    'Dit kwartier tot nu': ['This quarter hour so far', 'Diese Viertelstunde bisher', 'Dette kvarteret så langt', 'Denna kvart hittills', 'Dette kvarter indtil nu', 'Questo quarto d\'ora finora', 'Ce quart d\'heure jusqu\'ici', 'Este quarto de hora até agora', 'Este cuarto de hora hasta ahora'],
    'Telt mee als het minimum': ['Counts as the minimum', 'Zählt als Minimum', 'Teller som minimum', 'Räknas som minimum', 'Tæller som minimum', 'Conta come il minimo', 'Compte comme le minimum', 'Conta como o mínimo', 'Cuenta como el mínimo'],
    'Kost deze maand': ['Cost this month', 'Kosten diesen Monat', 'Kostnad denne måneden', 'Kostnad denna månad', 'Pris denne måned', 'Costo di questo mese', 'Coût ce mois-ci', 'Custo este mês', 'Coste este mes'],
    'Gemiddelde 12 maanden': ['Average of 12 months', 'Durchschnitt 12 Monate', 'Snitt 12 måneder', 'Snitt 12 månader', 'Gennemsnit 12 måneder', 'Media di 12 mesi', 'Moyenne sur 12 mois', 'Média de 12 meses', 'Media de 12 meses'],
    'Nog geen piek gemeten. Het dashboard meet elk kwartier je gemiddelde afname.': [
      'No peak measured yet. The dashboard measures your average import every quarter hour.',
      'Noch keine Spitze gemessen. Das Dashboard misst jede Viertelstunde deinen durchschnittlichen Bezug.',
      'Ingen topp målt ennå. Dashbordet måler det gjennomsnittlige forbruket ditt fra nettet hvert kvarter.',
      'Ingen topp uppmätt ännu. Instrumentpanelen mäter din genomsnittliga import varje kvart.',
      'Ingen spids målt endnu. Dashboardet måler dit gennemsnitlige forbrug fra nettet hvert kvarter.',
      'Nessun picco misurato finora. La dashboard misura il tuo prelievo medio ogni quarto d\'ora.',
      'Aucun pic mesuré pour l\'instant. Le tableau de bord mesure votre prélèvement moyen chaque quart d\'heure.',
      'Ainda nenhum pico medido. O painel mede o seu consumo médio da rede a cada quarto de hora.',
      'Aún no se ha medido ningún pico. El panel mide tu consumo medio de la red cada cuarto de hora.'],
    'Fasebelasting vandaag': ['Phase load today', 'Phasenlast heute', 'Fasebelastning i dag', 'Fasbelastning idag', 'Fasebelastning i dag', 'Carico per fase oggi', 'Charge par phase aujourd\'hui', 'Carga por fase hoje', 'Carga por fase hoy'],

    'Beste dag': ['Best day', 'Bester Tag', 'Beste dag', 'Bästa dag', 'Bedste dag', 'Giorno migliore', 'Meilleur jour', 'Melhor dia', 'Mejor día'],
    'Beste maand': ['Best month', 'Bester Monat', 'Beste måned', 'Bästa månad', 'Bedste måned', 'Mese migliore', 'Meilleur mois', 'Melhor mês', 'Mejor mes'],
  };

  // In the patterns, $1 is the text found as it is, @1 is that text translated from WORDS,
  // #1 is it translated in full and &1 is a comma separated list, each translated from WORDS
  const PERIOD = '(vandaag|gisteren|deze week|deze maand|dit jaar)';

  const PATTERNS = [
    [/^Negatieve stroomprijs \((.+)\/kWh\) terwijl je (.+) kW teruglevert$/, [
      'Negative electricity price ($1/kWh) while you export $2 kW',
      'Negativer Strompreis ($1/kWh), während du $2 kW einspeist',
      'Negativ strømpris ($1/kWh) mens du eksporterer $2 kW',
      'Negativt elpris ($1/kWh) medan du exporterar $2 kW',
      'Negativ elpris ($1/kWh), mens du eksporterer $2 kW',
      'Prezzo dell\'elettricità negativo ($1/kWh) mentre immetti $2 kW',
      'Prix de l\'électricité négatif ($1/kWh) alors que vous injectez $2 kW',
      'Preço da eletricidade negativo ($1/kWh) enquanto injeta $2 kW',
      'Precio de la luz negativo ($1/kWh) mientras inyectas $2 kW']],
    [/^Dit kwartier (.+) kW, boven je maandpiek van (.+) kW$/, [
      'This quarter hour $1 kW, above your monthly peak of $2 kW',
      'Diese Viertelstunde $1 kW, über deiner Monatsspitze von $2 kW',
      'Dette kvarteret $1 kW, over månedstoppen din på $2 kW',
      'Denna kvart $1 kW, över din månadstopp på $2 kW',
      'Dette kvarter $1 kW, over din månedsspids på $2 kW',
      'Questo quarto d\'ora $1 kW, sopra il tuo picco mensile di $2 kW',
      'Ce quart d\'heure $1 kW, au-dessus de votre pic mensuel de $2 kW',
      'Este quarto de hora $1 kW, acima do seu pico mensal de $2 kW',
      'Este cuarto de hora $1 kW, por encima de tu pico mensual de $2 kW']],
    [/^Rapport maken mislukt: (.+)$/, ['Making the report failed: #1', 'Bericht konnte nicht erstellt werden: #1', 'Kunne ikke lage rapporten: #1', 'Det gick inte att skapa rapporten: #1', 'Rapporten kunne ikke laves: #1', 'Creazione del rapporto non riuscita: #1', 'Impossible de créer le rapport : #1', 'Não foi possível criar o relatório: #1', 'No se pudo crear el informe: #1']],
    [/^Momentopname van (.+)\.$/, ['Snapshot of $1.', 'Momentaufnahme vom $1.', 'Øyeblikksbilde fra $1.', 'Ögonblicksbild från $1.', 'Øjebliksbillede fra $1.', 'Istantanea del $1.', 'Instantané du $1.', 'Instantâneo de $1.', 'Instantánea del $1.']],
    [/^gemeten sinds (.+)$/, ['measured since $1', 'gemessen seit $1', 'målt siden $1', 'uppmätt sedan $1', 'målt siden $1', 'misurato dal $1', 'mesuré depuis le $1', 'medido desde $1', 'medido desde el $1']],
    [/^(.+) per kWh$/, ['$1 per kWh', '$1 pro kWh', '$1 per kWh', '$1 per kWh', '$1 pr. kWh', '$1 per kWh', '$1 par kWh', '$1 por kWh', '$1 por kWh']],
    [/^af (.+) · terug (.+) kWh$/, ['import $1 · export $2 kWh', 'Bezug $1 · Einspeisung $2 kWh', 'import $1 · eksport $2 kWh', 'import $1 · export $2 kWh', 'import $1 · eksport $2 kWh', 'prelievo $1 · immissione $2 kWh', 'soutirage $1 · injection $2 kWh', 'consumo $1 · injeção $2 kWh', 'consumo $1 · inyección $2 kWh']],
    [/^in (.+) · uit (.+) kWh$/, ['in $1 · out $2 kWh', 'rein $1 · raus $2 kWh', 'inn $1 · ut $2 kWh', 'in $1 · ut $2 kWh', 'ind $1 · ud $2 kWh', 'entrata $1 · uscita $2 kWh', 'entrée $1 · sortie $2 kWh', 'entrada $1 · saída $2 kWh', 'entrada $1 · salida $2 kWh']],
    [/^Batterij (\d+%)$/, ['Battery $1', 'Batterie $1', 'Batteri $1', 'Batteri $1', 'Batteri $1', 'Batteria $1', 'Batterie $1', 'Bateria $1', 'Batería $1']],
    [/^(\d+) meldingen$/, ['$1 warnings', '$1 Meldungen', '$1 varsler', '$1 aviseringar', '$1 advarsler', '$1 avvisi', '$1 alertes', '$1 alertas', '$1 avisos']],
    [/^kWh = vandaag · (.+)$/, ['kWh = today · $1', 'kWh = heute · $1', 'kWh = i dag · $1', 'kWh = idag · $1', 'kWh = i dag · $1', 'kWh = oggi · $1', 'kWh = aujourd\'hui · $1', 'kWh = hoje · $1', 'kWh = hoy · $1']],
    [/^bijgewerkt (.+)$/, ['updated $1', 'aktualisiert $1', 'oppdatert $1', 'uppdaterad $1', 'opdateret $1', 'aggiornato $1', 'mis à jour $1', 'atualizado $1', 'actualizado $1']],
    [/^Doucheminuten zijn een schatting: (.+) L boiler, douchen op (.+) °C met (.+) L\/min\.$/, [
      'Shower minutes are an estimate: $1 L tank, showering at $2 °C with $3 L/min.',
      'Duschminuten sind eine Schätzung: $1 L Speicher, Duschen bei $2 °C mit $3 L/min.',
      'Dusjminutter er et anslag: $1 L bereder, dusj på $2 °C med $3 L/min.',
      'Duschminuter är en uppskattning: $1 L beredare, dusch på $2 °C med $3 L/min.',
      'Bruseminutter er et skøn: $1 L beholder, brusebad på $2 °C med $3 L/min.',
      'I minuti di doccia sono una stima: scaldabagno da $1 L, doccia a $2 °C con $3 L/min.',
      'Les minutes de douche sont une estimation : ballon de $1 L, douche à $2 °C avec $3 L/min.',
      'Os minutos de duche são uma estimativa: depósito de $1 L, duche a $2 °C com $3 L/min.',
      'Los minutos de ducha son una estimación: depósito de $1 L, ducha a $2 °C con $3 L/min.']],
    [/^(.*) · ingesteld (.+)$/, ['$1 · set to $2', '$1 · Soll $2', '$1 · innstilt $2', '$1 · inställt $2', '$1 · indstillet $2', '$1 · impostato $2', '$1 · consigne $2', '$1 · definido $2', '$1 · objetivo $2']],
    [new RegExp(`^Stroom ${PERIOD}$`), ['Electricity @1', 'Strom @1', 'Strøm @1', 'El @1', 'Strøm @1', 'Elettricità @1', 'Électricité @1', 'Eletricidade @1', 'Electricidad @1']],
    [new RegExp(`^Gas ${PERIOD} \\(hele huis\\)$`), ['Gas @1 (whole house)', 'Gas @1 (ganzes Haus)', 'Gass @1 (hele huset)', 'Gas @1 (hela huset)', 'Gas @1 (hele huset)', 'Gas @1 (tutta la casa)', 'Gaz @1 (toute la maison)', 'Gás @1 (toda a casa)', 'Gas @1 (toda la casa)']],
    [new RegExp(`^Geladen ${PERIOD}$`), ['Charged @1', 'Geladen @1', 'Ladet @1', 'Laddat @1', 'Opladet @1', 'Caricata @1', 'Chargé @1', 'Carregado @1', 'Cargado @1']],
    [new RegExp(`^Ontladen ${PERIOD}$`), ['Discharged @1', 'Entladen @1', 'Utladet @1', 'Urladdat @1', 'Afladet @1', 'Scaricata @1', 'Déchargé @1', 'Descarregado @1', 'Descargado @1']],
    [/^Accu (.+)$/, ['Battery $1', 'Batterie $1', 'Batteri $1', 'Batteri $1', 'Batteri $1', 'Batteria $1', 'Batterie $1', 'Bateria $1', 'Batería $1']],
    [/^laadt (.+)$/, ['charging $1', 'lädt $1', 'lader $1', 'laddar $1', 'lader $1', 'in carica $1', 'charge $1', 'a carregar $1', 'cargando $1']],
    [/^(.+) reageert niet$/, ['$1 does not respond', '$1 reagiert nicht', '$1 svarer ikke', '$1 svarar inte', '$1 svarer ikke', '$1 non risponde', '$1 ne répond pas', '$1 não responde', '$1 no responde']],
    [/^Sluipverbruik is (\d+) W, normaal (\d+) W$/, ['Standby use is $1 W, usually $2 W', 'Standby-Verbrauch ist $1 W, normal $2 W', 'Standby-forbruk er $1 W, normalt $2 W', 'Standby-förbrukningen är $1 W, normalt $2 W', 'Standbyforbrug er $1 W, normalt $2 W', 'Il consumo in standby è $1 W, di solito $2 W', 'La consommation en veille est de $1 W, habituellement $2 W', 'O consumo em standby é $1 W, normalmente $2 W', 'El consumo en espera es $1 W, normalmente $2 W']],
    [/^(.+) staat al (\d+) uur aan \((.+)\)$/, ['$1 has been on for $2 hours ($3)', '$1 ist seit $2 Stunden an ($3)', '$1 har vært på i $2 timer ($3)', '$1 har varit på i $2 timmar ($3)', '$1 har været tændt i $2 timer ($3)', '$1 è acceso da $2 ore ($3)', '$1 est allumé depuis $2 heures ($3)', '$1 está ligado há $2 horas ($3)', '$1 lleva $2 horas encendido ($3)']],
    [/^(\d+) thuisbatterijen gevonden: (.+)\. Is dit dezelfde batterij via twee apps\? Kies er één bij de instellingen\.$/, [
      '$1 home batteries found: $2. Is this the same battery through two apps? Choose one in the settings.',
      '$1 Heimspeicher gefunden: $2. Ist das derselbe Speicher über zwei Apps? Wähle einen in den Einstellungen.',
      '$1 hjemmebatterier funnet: $2. Er dette samme batteri via to apper? Velg ett i innstillingene.',
      '$1 hembatterier hittades: $2. Är det samma batteri via två appar? Välj ett i inställningarna.',
      '$1 hjemmebatterier fundet: $2. Er det det samme batteri via to apps? Vælg et i indstillingerne.',
      '$1 batterie domestiche trovate: $2. È la stessa batteria tramite due app? Scegline una nelle impostazioni.',
      '$1 batteries domestiques trouvées : $2. S\'agit-il de la même batterie via deux applications ? Choisissez-en une dans les réglages.',
      '$1 baterias domésticas encontradas: $2. É a mesma bateria através de duas apps? Escolha uma nas definições.',
      'Se encontraron $1 baterías domésticas: $2. ¿Es la misma batería a través de dos apps? Elige una en los ajustes.']],
    [/^(.+) m³ · (.+) m³ per graaddag$/, ['$1 m³ · $2 m³ per degree day', '$1 m³ · $2 m³ pro Gradtag', '$1 m³ · $2 m³ per graddag', '$1 m³ · $2 m³ per graddag', '$1 m³ · $2 m³ pr. graddag', '$1 m³ · $2 m³ per grado giorno', '$1 m³ · $2 m³ par degré-jour', '$1 m³ · $2 m³ por grau-dia', '$1 m³ · $2 m³ por grado-día']],
    [/^(.+) m³ per graaddag$/, ['$1 m³ per degree day', '$1 m³ pro Gradtag', '$1 m³ per graddag', '$1 m³ per graddag', '$1 m³ pr. graddag', '$1 m³ per grado giorno', '$1 m³ par degré-jour', '$1 m³ por grau-dia', '$1 m³ por grado-día']],
    [new RegExp(`^Opbrengst ${PERIOD}$`), ['Earnings @1', 'Ertrag @1', 'Inntekt @1', 'Intäkt @1', 'Indtægt @1', 'Ricavo @1', 'Revenu @1', 'Receita @1', 'Ingresos @1']],
    [/^levert (.+)$/, ['supplying $1', 'liefert $1', 'leverer $1', 'levererar $1', 'leverer $1', 'fornisce $1', 'fournit $1', 'fornece $1', 'suministra $1']],
    [/^t\.o\.v\. (.+)$/, ['compared to @1', 'vs. @1', 'mot @1', 'jämfört med @1', 'i forhold til @1', 'vs @1', 'vs @1', 'vs. @1', 'vs. @1']],
    [/^(.+) · kWh$/, ['@1 · kWh', '@1 · kWh', '@1 · kWh', '@1 · kWh', '@1 · kWh', '@1 · kWh', '@1 · kWh', '@1 · kWh', '@1 · kWh']],
    [/^Vermogen (vandaag|gisteren)$/, ['Power @1', 'Leistung @1', 'Effekt @1', 'Effekt @1', 'Effekt @1', 'Potenza @1', 'Puissance @1', 'Potência @1', 'Potencia @1']],
    [/^(vandaag|gisteren) · verbruik (.+) kWh · zon (.+) kWh$/, ['@1 · consumption $2 kWh · solar $3 kWh', '@1 · Verbrauch $2 kWh · Solar $3 kWh', '@1 · forbruk $2 kWh · sol $3 kWh', '@1 · förbrukning $2 kWh · sol $3 kWh', '@1 · forbrug $2 kWh · sol $3 kWh', '@1 · consumo $2 kWh · solare $3 kWh', '@1 · consommation $2 kWh · solaire $3 kWh', '@1 · consumo $2 kWh · solar $3 kWh', '@1 · consumo $2 kWh · solar $3 kWh']],
    [/^(vandaag|gisteren) · verbruik (.+) kWh$/, ['@1 · consumption $2 kWh', '@1 · Verbrauch $2 kWh', '@1 · forbruk $2 kWh', '@1 · förbrukning $2 kWh', '@1 · forbrug $2 kWh', '@1 · consumo $2 kWh', '@1 · consommation $2 kWh', '@1 · consumo $2 kWh', '@1 · consumo $2 kWh']],
    [/^(\d\d:\d\d) · verbruik (.+) · zon (.+)$/, ['$1 · consumption $2 · solar $3', '$1 · Verbrauch $2 · Solar $3', '$1 · forbruk $2 · sol $3', '$1 · förbrukning $2 · sol $3', '$1 · forbrug $2 · sol $3', '$1 · consumo $2 · solare $3', '$1 · consommation $2 · solaire $3', '$1 · consumo $2 · solar $3', '$1 · consumo $2 · solar $3']],
    [/^(\d\d:\d\d) · verbruik (.+)$/, ['$1 · consumption $2', '$1 · Verbrauch $2', '$1 · forbruk $2', '$1 · förbrukning $2', '$1 · forbrug $2', '$1 · consumo $2', '$1 · consommation $2', '$1 · consumo $2', '$1 · consumo $2']],
    [/^Geen prijzen: (.+)$/, ['No prices: #1', 'Keine Preise: #1', 'Ingen priser: #1', 'Inga priser: #1', 'Ingen priser: #1', 'Nessun prezzo: #1', 'Pas de prix : #1', 'Sem preços: #1', 'Sin precios: #1']],
    [/^Prijzen niet beschikbaar \((.+)\)$/, ['Prices not available ($1)', 'Preise nicht verfügbar ($1)', 'Priser ikke tilgjengelig ($1)', 'Priser inte tillgängliga ($1)', 'Priser ikke tilgængelige ($1)', 'Prezzi non disponibili ($1)', 'Prix non disponibles ($1)', 'Preços indisponíveis ($1)', 'Precios no disponibles ($1)']],
    [/^(.+) · incl\. btw \+ opslag$/, ['$1 · incl. VAT + surcharge', '$1 · inkl. MwSt. + Aufschlag', '$1 · inkl. mva + påslag', '$1 · inkl. moms + påslag', '$1 · inkl. moms + tillæg', '$1 · IVA incl. + maggiorazione', '$1 · TTC + marge', '$1 · c/ IVA + margem', '$1 · con IVA + margen']],
    [/^(.+) · incl\. btw$/, ['$1 · incl. VAT', '$1 · inkl. MwSt.', '$1 · inkl. mva', '$1 · inkl. moms', '$1 · inkl. moms', '$1 · IVA incl.', '$1 · TTC', '$1 · c/ IVA', '$1 · con IVA']],
    [/^Goedkoopste (\d+) uur$/, ['Cheapest $1 hours', 'Günstigste $1 Stunden', 'Billigste $1 timer', 'Billigaste $1 timmarna', 'Billigste $1 timer', '$1 ore più economiche', '$1 heures les moins chères', '$1 horas mais baratas', '$1 horas más baratas']],
    [/^morgen (.+)$/, ['tomorrow $1', 'morgen $1', 'i morgen $1', 'imorgon $1', 'i morgen $1', 'domani $1', 'demain $1', 'amanhã $1', 'mañana $1']],
    [/^(.*)nu ([\d.,]+ L\/min)$/, ['$1now $2', '$1jetzt $2', '$1nå $2', '$1nu $2', '$1nu $2', '$1ora $2', '$1maintenant $2', '$1agora $2', '$1ahora $2']],
    [/^hoofdzekering (.+) A$/, ['main fuse $1 A', 'Hauptsicherung $1 A', 'hovedsikring $1 A', 'huvudsäkring $1 A', 'hovedsikring $1 A', 'fusibile principale $1 A', 'disjoncteur principal $1 A', 'disjuntor principal $1 A', 'fusible principal $1 A']],
    [/^vorige periode (.+)$/, ['previous period $1', 'vorheriger Zeitraum $1', 'forrige periode $1', 'föregående period $1', 'forrige periode $1', 'periodo precedente $1', 'période précédente $1', 'período anterior $1', 'periodo anterior $1']],
    [/^· verwacht vandaag (.+) kWh · morgen (.+) kWh$/, ['· expected today $1 kWh · tomorrow $2 kWh', '· erwartet heute $1 kWh · morgen $2 kWh', '· forventet i dag $1 kWh · i morgen $2 kWh', '· förväntat idag $1 kWh · imorgon $2 kWh', '· forventet i dag $1 kWh · i morgen $2 kWh', '· previsto oggi $1 kWh · domani $2 kWh', '· prévu aujourd\'hui $1 kWh · demain $2 kWh', '· previsto hoje $1 kWh · amanhã $2 kWh', '· previsto hoy $1 kWh · mañana $2 kWh']],
    [/^· verwacht vandaag (.+) kWh$/, ['· expected today $1 kWh', '· erwartet heute $1 kWh', '· forventet i dag $1 kWh', '· förväntat idag $1 kWh', '· forventet i dag $1 kWh', '· previsto oggi $1 kWh', '· prévu aujourd\'hui $1 kWh', '· previsto hoje $1 kWh', '· previsto hoy $1 kWh']],
    [/^(.+) per uur$/, ['$1 per hour', '$1 pro Stunde', '$1 per time', '$1 per timme', '$1 pr. time', '$1 all\'ora', '$1 par heure', '$1 por hora', '$1 por hora']],
    [/^Bewerken lukt niet: (.+)$/, ['Cannot edit: #1', 'Bearbeiten nicht möglich: #1', 'Kan ikke redigere: #1', 'Kan inte redigera: #1', 'Kan ikke redigere: #1', 'Impossibile modificare: #1', 'Modification impossible : #1', 'Não é possível editar: #1', 'No se puede editar: #1']],
    [/^\+ (.+)$/, ['+ @1', '+ @1', '+ @1', '+ @1', '+ @1', '+ @1', '+ @1', '+ @1', '+ @1']],
    [/^Niet gevonden: (.+)\.$/, ['Not found: &1.', 'Nicht gefunden: &1.', 'Ikke funnet: &1.', 'Hittades inte: &1.', 'Ikke fundet: &1.', 'Non trovato: &1.', 'Introuvable : &1.', 'Não encontrado: &1.', 'No encontrado: &1.']],
    [/^Onbekend blok: (.+)$/, ['Unknown block: $1', 'Unbekannter Block: $1', 'Ukjent blokk: $1', 'Okänt block: $1', 'Ukendt blok: $1', 'Blocco sconosciuto: $1', 'Bloc inconnu : $1', 'Bloco desconhecido: $1', 'Bloque desconocido: $1']],
    [/^Onbekende breedte: (.+)$/, ['Unknown width: $1', 'Unbekannte Breite: $1', 'Ukjent bredde: $1', 'Okänd bredd: $1', 'Ukendt bredde: $1', 'Larghezza sconosciuta: $1', 'Largeur inconnue : $1', 'Largura desconhecida: $1', 'Ancho desconocido: $1']],
    [/^Onbekende hoogte: (.+)$/, ['Unknown height: $1', 'Unbekannte Höhe: $1', 'Ukjent høyde: $1', 'Okänd höjd: $1', 'Ukendt højde: $1', 'Altezza sconosciuta: $1', 'Hauteur inconnue : $1', 'Altura desconhecida: $1', 'Altura desconocida: $1']],
    [/^(.+) → (.+): (.+)$/, ['@1 → @2: $3', '@1 → @2: $3', '@1 → @2: $3', '@1 → @2: $3', '@1 → @2: $3', '@1 → @2: $3', '@1 → @2: $3', '@1 → @2: $3', '@1 → @2: $3']],
    [/^(.+): ([\d.,]+ k?Wh?)$/, ['@1: $2', '@1: $2', '@1: $2', '@1: $2', '@1: $2', '@1: $2', '@1: $2', '@1: $2', '@1: $2']],
    [/^Fout (\d+)$/, ['Error $1', 'Fehler $1', 'Feil $1', 'Fel $1', 'Fejl $1', 'Errore $1', 'Erreur $1', 'Erro $1', 'Error $1']],
    [/^Homey gaf (\d+) op (.+)$/, ['Homey returned $1 for $2', 'Homey gab $1 für $2 zurück', 'Homey returnerte $1 for $2', 'Homey returnerade $1 för $2', 'Homey returnerede $1 for $2', 'Homey ha restituito $1 per $2', 'Homey a renvoyé $1 pour $2', 'O Homey devolveu $1 para $2', 'Homey devolvió $1 para $2']],
  ];

  const word = text => WORDS[text]?.[column] ?? text;
  const list = text => text.split(', ').map(word).join(', ');

  // Puts the texts found by a pattern into its translation
  function fill(template, found) {
    return template.replace(/([$@#&])(\d)/g, (_, kind, n) => {
      const text = found[n - 1] ?? '';
      if (kind === '@') return word(text);
      if (kind === '#') return translate(text);
      if (kind === '&') return list(text);
      return text;
    });
  }

  // Translates one text, keeping the white space around it
  function translate(text) {
    if (column < 0 || !text) return text;
    const core = text.trim();
    if (!core || !/[a-z]/i.test(core)) return text;
    let out = WORDS[core]?.[column];
    if (out === undefined) {
      for (const [pattern, templates] of PATTERNS) {
        const found = core.match(pattern);
        if (found) {
          out = fill(templates[column], found.slice(1));
          break;
        }
      }
    }
    if (out === undefined || out === core) return text;
    return text.replace(core, out);
  }

  const ATTRIBUTES = ['title', 'aria-label', 'placeholder'];

  function translateAttributes(el) {
    for (const name of ATTRIBUTES) {
      const value = el.getAttribute(name);
      if (value === null) continue;
      const out = translate(value);
      if (out !== value) el.setAttribute(name, out);
    }
  }

  function translateText(node) {
    const out = translate(node.nodeValue);
    if (out !== node.nodeValue) node.nodeValue = out;
  }

  function translateTree(root) {
    if (root.nodeType === Node.TEXT_NODE) return translateText(root);
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE) {
      if (root.tagName === 'SCRIPT' || root.tagName === 'STYLE') return;
      if (root.classList.contains('lang-switch')) return;
      translateAttributes(root);
      if (root.tagName === 'TEMPLATE') translateTree(root.content);
    }
    for (const child of root.childNodes) translateTree(child);
  }

  // A choice of language in the header, each language by its own name; the page loads again
  // in the chosen language
  function addSwitch() {
    const actions = document.querySelector('.header-actions');
    if (!actions) return;
    const select = document.createElement('select');
    select.className = 'lang-switch';
    select.setAttribute('aria-label', translate('Taal'));
    select.innerHTML = Object.entries(LANGUAGES).map(([code, [name]]) =>
      `<option value="${code}" lang="${code}"${code === lang ? ' selected' : ''}>${name}</option>`).join('');
    select.addEventListener('change', () => {
      try { localStorage.setItem(KEY, select.value); } catch { /* storage unavailable */ }
      location.reload();
    });
    actions.insertBefore(select, actions.firstChild);
  }

  function start() {
    document.documentElement.lang = lang;
    addSwitch();
    if (column < 0) return;
    document.title = translate(document.title);
    translateTree(document.body);
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') translateText(record.target);
        else if (record.type === 'attributes') translateAttributes(record.target);
        else record.addedNodes.forEach(translateTree);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });
  }

  window.EnergyI18n = {
    lang,
    locale: LANGUAGES[lang][1],
    translate,
    start,
  };

})();
