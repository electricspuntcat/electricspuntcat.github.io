/**
 * Google Apps Script per connectar el teu Google Sheet amb l'App Android de Càrregues EV
 * 
 * Gestiona:
 * 1. Afegeix nova fila (action: 'appendRow')
 * 2. Actualitza fila existent (action: 'updateRow')
 * 3. Elimina fila (action: 'deleteRow')
 * 4. Lectura de l'històric complet amb índex de fila (doGet)
 * 5. Sistema de rescat per a mòbils (permet escriure via doGet/JSONP per esquivar bloquejos mòbils)
 * 
 * Columnes del full (14):
 * Dia, PdC, Hora Inici, Hora Fi, Temps (min), % in, % fi, % Dif, kWh, kW mijans, Preu, Cost, Cotxe, Km
 */

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = {};

    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (errJson) {
        data = e.parameter || {};
      }
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    var action = data.action || 'appendRow';
    var c = data.charge || data;

    // 1. ACTUALITZAR FILA EXISTENT
    if (action === 'updateRow' || action === 'editCharge') {
      var rowNum = parseInt(data.rowNumber || (c && c.rowNumber), 10);
      var targetRow = -1;

      if (rowNum && rowNum >= 2 && rowNum <= sheet.getLastRow()) {
        targetRow = rowNum;
      } else {
        // Cerca des del final (les més recents)
        var lastRow = sheet.getLastRow();
        if (lastRow >= 2) {
          var startSearch = Math.max(2, lastRow - 50);
          var count = lastRow - startSearch + 1;
          var searchVals = sheet.getRange(startSearch, 1, count, 14).getDisplayValues();
          for (var j = searchVals.length - 1; j >= 0; j--) {
            var rowDia = searchVals[j][0];
            var rowCotxe = searchVals[j][12];
            var rowInici = searchVals[j][2];
            if (rowDia === c.Dia && rowCotxe.toLowerCase().indexOf((c.Cotxe || '').toLowerCase()) !== -1) {
              if (!c.oldHoraInici || rowInici === c.oldHoraInici || rowInici === c.HoraInici) {
                targetRow = startSearch + j;
                break;
              }
            }
          }
        }
      }

      if (targetRow >= 2) {
        sheet.getRange(targetRow, 1, 1, 14).setValues([[
          c.Dia || '', c.PdC || 'Home', c.HoraInici || '', c.HoraFi || '', c.Temps || '',
          c.PercentIn || '', c.PercentFi || '', c.PercentDif || '', c.Kwh || '', c.KwMijans || '',
          c.Preu || '', c.Cost || '', c.Cotxe || 'Tesla', c.Km || ''
        ]]);

        return respondJson({
          status: 'success',
          action: 'updateRow',
          row: targetRow,
          message: 'Fila ' + targetRow + ' actualitzada correctament'
        });
      }
    }

    // 2. ELIMINAR FILA
    if (action === 'deleteRow') {
      var delRowNum = parseInt(data.rowNumber || (c && c.rowNumber), 10);
      if (delRowNum && delRowNum >= 2 && delRowNum <= sheet.getLastRow()) {
        sheet.deleteRow(delRowNum);
        return respondJson({
          status: 'success',
          action: 'deleteRow',
          row: delRowNum,
          message: 'Fila ' + delRowNum + ' eliminada'
        });
      }
    }

    // 3. AFEGIR NOVA FILA (appendRow)
    sheet.appendRow([
      c.Dia || '', c.PdC || 'Home', c.HoraInici || '', c.HoraFi || '', c.Temps || '',
      c.PercentIn || '', c.PercentFi || '', c.PercentDif || '', c.Kwh || '', c.KwMijans || '',
      c.Preu || '', c.Cost || '', c.Cotxe || 'Tesla', c.Km || ''
    ]);

    var newLastRow = sheet.getLastRow();

    return respondJson({
      status: 'success',
      action: 'appendRow',
      row: newLastRow,
      message: 'Càrrega afegida correctament a la fila ' + newLastRow
    });

  } catch (error) {
    return respondJson({
      status: 'error',
      message: error.toString()
    });
  }
}

// LECTURA I SISTEMA DE RESCAT PER A MÒBILS VIA GET
function doGet(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'getCharges';
    var callback = (e && e.parameter && e.parameter.callback) ? e.parameter.callback : null;

    // SISTEMA DE RESCAT PER A MÒBILS: Permet gravar o actualitzar via GET si el mòbil bloqueja el POST
    if (action === 'appendRow' || action === 'updateRow' || action === 'addCharge') {
      var payloadStr = e.parameter.data || e.parameter.payload || e.parameter.charge;
      var c = {};
      if (payloadStr) {
        try { c = JSON.parse(payloadStr); } catch (errJson) { c = e.parameter; }
      } else {
        c = e.parameter;
      }

      if (action === 'updateRow') {
        var rowNum = parseInt(e.parameter.rowNumber || (c && c.rowNumber), 10);
        var targetRow = -1;

        if (rowNum && rowNum >= 2 && rowNum <= sheet.getLastRow()) {
          targetRow = rowNum;
        } else {
          var lastRow = sheet.getLastRow();
          if (lastRow >= 2) {
            var startSearch = Math.max(2, lastRow - 50);
            var count = lastRow - startSearch + 1;
            var searchVals = sheet.getRange(startSearch, 1, count, 14).getDisplayValues();
            for (var j = searchVals.length - 1; j >= 0; j--) {
              var rowDia = searchVals[j][0];
              var rowCotxe = searchVals[j][12];
              var rowInici = searchVals[j][2];
              if (rowDia === c.Dia && rowCotxe.toLowerCase().indexOf((c.Cotxe || '').toLowerCase()) !== -1) {
                targetRow = startSearch + j;
                break;
              }
            }
          }
        }

        if (targetRow >= 2) {
          sheet.getRange(targetRow, 1, 1, 14).setValues([[
            c.Dia || '', c.PdC || 'Home', c.HoraInici || '', c.HoraFi || '', c.Temps || '',
            c.PercentIn || '', c.PercentFi || '', c.PercentDif || '', c.Kwh || '', c.KwMijans || '',
            c.Preu || '', c.Cost || '', c.Cotxe || 'Tesla', c.Km || ''
          ]]);
          return respondJson({ status: 'success', action: 'updateRow', row: targetRow, message: 'Fila actualitzada via GET' }, callback);
        }
      }

      // Afegir fila
      sheet.appendRow([
        c.Dia || '', c.PdC || 'Home', c.HoraInici || '', c.HoraFi || '', c.Temps || '',
        c.PercentIn || '', c.PercentFi || '', c.PercentDif || '', c.Kwh || '', c.KwMijans || '',
        c.Preu || '', c.Cost || '', c.Cotxe || 'Tesla', c.Km || ''
      ]);

      return respondJson({ status: 'success', action: 'appendRow', row: sheet.getLastRow(), message: 'Càrrega afegida via GET' }, callback);
    }

    // RETORNAR TOTES LES FILES PER A L'HISTÒRIC
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return respondJson({ status: 'success', data: [] }, callback);
    }

    var values = sheet.getRange(2, 1, lastRow - 1, 14).getDisplayValues();
    var list = [];

    for (var i = 0; i < values.length; i++) {
      var r = values[i];
      if (!r[0]) continue;
      var rowNumber = i + 2;

      list.push({
        rowNumber: rowNumber,
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
