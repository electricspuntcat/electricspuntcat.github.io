# ⚡ Càrrega EV - App Android per a Peugeot e-2008 & Tesla Model 3

Aquesta aplicació està dissenyada específicament per registrar i controlar les càrregues dels teus dos vehicles elèctrics (**Peugeot e-2008** i **Tesla Model 3**), sincronitzant-se directament amb el teu [Google Sheet](https://docs.google.com/spreadsheets/d/172Qbr7TNXVji0boL61hC35tx6-9Oh9fCxk0rxzbvQsw/edit).

---

## ✨ Funcionalitats Implementades

1. **Selector directe de vehicle amb 1 sol toc**:
   - 🦁 **Peugeot e-2008** (bateria ~50 kWh)
   - ⚡ **Tesla Model 3** (bateria ~60 kWh)
2. **Suggeriment intel·ligent d'horaris**:
   - Botons d'un clic per a les franges habituals:
     - 🌙 **Nit vall (01:00 - 07:00)**
     - ⚡ **Vall llarga (00:00 - 08:00)**
     - 🕒 **Última habitual**: replica exactament la darrera franja que vas fer servir.
   - Càlcul automàtic de la durada (fins i tot si creua la mitjanit).
3. **Gestió intel·ligent del preu**:
   - **Tarifa casa per defecte** (configurable a la pestanya d'Ajustos, ex: `0.12 €/kWh` o el que tinguis contractat).
   - En introduir els **kWh**, l'app et calcula el cost automàticament.
   - Selector per commutar entre **Casa** i **Públic / Supercharger**.
   - Possibilitat d'introduir o modificar manualment el preu final de la càrrega.
4. **Seguiment històric i despesa completa**:
   - **Despesa aquest mes** i kWh totals del mes.
   - **Despesa total acumulada**.
   - **Comparativa per vehicle**: barres visuals de percentatge de despesa i consum kWh (Peugeot vs Tesla).
   - **Gràfica mensual interactiva** de despesa.
   - **Llista cronològica** de totes les càrregues amb opció d'eliminar registres.
5. **Connexió directa amb Google Sheets**:
   - Funciona fins i tot sense cobertura (guarda al telèfon i sincronitza en recuperar connexió).
   - Exportació a fitxer CSV en qualsevol moment.

---

## 🚀 Com connectar-la al teu Google Sheet en 2 minuts

El fitxer `GoogleAppsScript.gs` conté el codi que fa de pont amb el teu full de càlcul:

1. Obre el teu full de càlcul: [Google Sheet Càrregues](https://docs.google.com/spreadsheets/d/172Qbr7TNXVji0boL61hC35tx6-9Oh9fCxk0rxzbvQsw/edit)
2. Al menú superior de Google Sheets, ves a:
   **Extensions > Apps Script**
3. Esborra qualsevol codi que hi hagi a l'editor i enganxa el contingut del fitxer [`GoogleAppsScript.gs`](GoogleAppsScript.gs).
4. Fes clic a la icona de **Desar** (el disquet 💾).
5. A dalt a la dreta, fes clic al botó blau **Desplega > Nou desplegament**.
6. A la roda dentada ⚙️ (tipus), selecciona **Aplicació web**.
7. Omple els camps:
   - **Descripció**: `API Carregues EV`
   - **Executa com a**: `Jo (<el teu compte de Google>)`
   - **Qui té accés**: `Qualsevol persona` (*Important per permetre enviar dades des del telèfon mòbil*)
8. Fes clic a **Desplega**. Si Google et demana autorització, accepta els permisos.
9. Copia la **URL de l'aplicació web** que et mostrarà (acaba en `/exec`).
10. Obre la teva app, ves a la pestanya **Configuració**, enganxa aquesta URL i prem **Connectar Full**. Fet!

---

## 📱 Com instal·lar-la al teu Android

Com que és una **PWA (Progressive Web App)**:

1. Pots allotjar aquesta carpeta a qualsevol servei gratuït (com **GitHub Pages**, **Vercel** o **Cloudflare Pages**) en 1 minut.
2. Obre la URL des del navegador **Google Chrome** al teu mòbil Android.
3. Prem els tres punts del menú de Chrome (⋮) a dalt a la dreta i selecciona:
   👉 **"Afegeix a la pantalla d'inici"** o bé **"Instal·la l'aplicació"**.
4. L'aplicació s'instal·larà al teu mòbil com una app nativa:
   - Tindrà la seva pròpia icona verda de càrrega ⚡ al menú d'aplicacions.
   - S'obrirà a pantalla completa sense barres d'adreces de navegador.
   - Funcionarà ràpidament i de manera fluida.
