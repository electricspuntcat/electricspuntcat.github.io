/**
 * Google Apps Script per connectar el teu Google Sheet amb l'App Android de Càrregues EV
 * 
 * Gestiona tant l'escriptura (doPost) com la lectura de l'històric complet (doGet)
 * fidel a les 14 columnes:
 * Dia, PdC, Hora Inici, Hora Fi, Temps (min), % in, % fi, % Dif, kWh, kW mijans, Preu, Cost, Cotxe, Km
 */

// AFEGIR NOVA CÀRREGA AL FULL
function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = {};

    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    var c = data.charge || data;

    // Afegim la fila respectant el format de 14 columnes
    sheet.appendRow([
      c.Dia || '',
      c.PdC || 'Home',
      c.HoraInici || '',
      c.HoraFi || '',
      c.Temps || '',
      c.PercentIn || '',
      c.PercentFi || '',
      c.PercentDif || '',
      c.Kwh || '',
      c.KwMijans || '',
      c.Preu || '',
      c.Cost || '',
      c.Cotxe || 'Tesla',
      c.Km || ''
    ]);

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      row: sheet.getLastRow(),
      message: 'Càrrega afegida correctament al Google Sheet'
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// LLEGIR L'HISTÒRIC DEL FULL PER L'APP
function doGet(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var lastRow = sheet.getLastRow();
    var callback = (e && e.parameter && e.parameter.callback) ? e.parameter.callback : null;

    if (lastRow <= 1) {
      return respondJson({ status: 'success', data: [] }, callback);
    }

    // Obtenim els valors tal com es mostren al full
    var values = sheet.getRange(2, 1, lastRow - 1, 14).getDisplayValues();
    var list = [];

    for (var i = 0; i < values.length; i++) {
      var r = values[i];
      if (!r[0]) continue; // Omet files buides

      list.push({
        Dia: r[0],
        PdC: r[1] || 'Home',
        HoraInici: r[2] || '',
        HoraFi: r[3] || '',
        Temps: parseInt(r[4], 10) || 0,
        PercentIn: r[5] || '',
        PercentFi: r[6] || '',
        PercentDif: r[7] || '',
        Kwh: parseFloat((r[8] || '0').replace(',', '.')) || 0,
        KwMijans: r[9] || '',
        Preu: r[10] || '',
        Cost: r[11] || '',
        Cotxe: (r[12] || '').toLowerCase().indexOf('tesla') !== -1 ? 'Tesla' : 'Peugeot',
        Km: r[13] ? parseInt(r[13].replace(/\D/g, ''), 10) : ''
      });
    }

    // Invertim perquè la més recent sigui la primera a l'app
    list.reverse();

    var result = {
      status: 'success',
      total: list.length,
      data: list
    };

    return respondJson(result, callback);

  } catch (error) {
    return respondJson({ status: 'error', message: error.toString() }, callback);
  }
}

function respondJson(obj, callback) {
  var str = JSON.stringify(obj);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + str + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(str)
    .setMimeType(ContentService.MimeType.JSON);
}
