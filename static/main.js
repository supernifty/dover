var
  g = {}, // globals

  set_update = function(msg) {
    $('#summary').attr('class', 'alert alert-info');
    $('#summary').html(msg); 
  },

  set_url = function(url) {
    g['url'] = url;
  },

  set_error = function() {
    $('#summary').attr('class', 'alert alert-error alert-dismissable');
    $('#summary').html('Failed to load data.'); 
  },

  calculate_summary = function() {
    var summary = {'columns': {}, 'missing_row': []}, 
      datatype = [],
      missing_row;

    g['excluded_rows'] = new Set();
    g['excluded_cols'] = new Set();
    for (header in g['data']['meta']['header']) { // 0..len
      summary['columns'][header] = {'missing': 0, 'distinct': {}, 'min': 1e9, 'max': -1e9, 'count': 0, 'sum': 0};
      datatype.push('numeric');
    }

    // populate summary
    for (row in g['data']['data']) {
      missing_row = 0;
      for (col in g['data']['data'][row]) { // 0..col
        if (g['data']['data'][row][col] == '') {
          summary['columns'][col]['missing'] += 1;
          missing_row += 1;
        }
        else { // not missing
          if (!$.isNumeric(g['data']['data'][row][col])) {
            datatype[col] = 'categorical';
          }
          else {
            summary['columns'][col]['min'] = Math.min(summary['columns'][col]['min'], g['data']['data'][row][col]); 
            summary['columns'][col]['max'] = Math.max(summary['columns'][col]['max'], g['data']['data'][row][col]); 
            summary['columns'][col]['count'] += 1;
            summary['columns'][col]['sum'] += Number(g['data']['data'][row][col]);
          }
        }
        if (!(g['data']['data'][row][col] in summary['columns'][col]['distinct'])) {
          summary['columns'][col]['distinct'][g['data']['data'][row][col]] = 0;
        }
        summary['columns'][col]['distinct'][g['data']['data'][row][col]] += 1;
      }
      summary['missing_row'].push(missing_row);
    }

    if ('datatype' in g['data']['meta']) {
      datatype = g['data']['meta']['datatype'];
    }

    summary['datatype'] = datatype;
    g['summary'] = summary;
  },

  show_overview = function() {
    set_update('Loaded <strong>' + g['data']['data'].length + '</strong> rows with <strong>' + g['data']['meta']['header'].length + '</strong> columns.'); 
  },

  show_columns = function() {
    // prepare summary object
    var converted = [];

    // convert to datatable
    for (column in g['data']['meta']['header']) { // 0..len
      if (g['summary']['datatype'][column] != 'categorical' && g['summary']['columns'][column]['count'] > 0) {
        converted.push([
          g['data']['meta']['header'][column], 
          100 * g['summary']['columns'][column]['missing'] / g['data']['data'].length, 
          Object.keys(g['summary']['columns'][column]['distinct']).length, 
          g['summary']['datatype'][column],
          g['summary']['columns'][column]['min'], 
          g['summary']['columns'][column]['max'], 
          (g['summary']['columns'][column]['sum'] / g['summary']['columns'][column]['count']).toFixed(1)
        ]);
      }
      else {
        converted.push([
          g['data']['meta']['header'][column], 
          100 * g['summary']['columns'][column]['missing'] / g['data']['data'].length, 
          Object.keys(g['summary']['columns'][column]['distinct']).length, 
          g['summary']['datatype'][column],
          '',
          '',
          ''
        ]);
      }
    }

    $('#table_columns').DataTable({
      "destroy": true,
      "order": [[ 0, "asc" ]],
      "paging": false,
      "searching": false,
      "bInfo" : false,
      "columnDefs": [ {
        "targets": 1, //  missing%
          "render": function ( data, type, full, meta ) {
            return data.toFixed(1);
          }
        }
      ],
      "select": {
        style: 'os',
        selector: 'td:first-child'
      },
      "data": converted
    });
    $('#table_columns tbody').on( 'click', 'tr', select_overview);
  },

  show_missing = function() {
    var
      layout = { title: '% Missing data for each column', xaxis: {} },
      x = [], 
      y = [];
    
    for (column in g['summary']['columns']) {
      x.push(g['data']['meta']['header'][column]);
      y.push(100 * g['summary']['columns'][column]['missing'] / g['data']['data'].length);
    }

    converted = [ {
       x: x,
       y: y,
       type: 'bar'
    } ];

    Plotly.plot("missing_by_column", converted, layout, {displayModeBar: false});

    // rows with missing data
    layout = { 
      title: 'Rows with missing data',
      bargap: 0.05,
      xaxis: { title: 'Number of columns of missing data' },
      yaxis: { title: 'Number of rows' }
    };
    converted = [ { x: g['summary']['missing_row'], type: 'histogram' } ];
    
    Plotly.plot("missing_by_row", converted, layout, {displayModeBar: false});
  },
  
  show_column_dists = function() {
    const
      COLS_PER_GRAPH = 6;
    var 
      cols = numeric.transpose(g['data']['data']), 
      converted, x, y, layout,
      width = Math.round(COLS_PER_GRAPH/12 * $('.container').width());
    for (var col in g['data']['meta']['header']) { // 0.. cols
      x = [];
      y = [];
      if (g['summary']['datatype'][col] == 'categorical') {
        for (distinct in g['summary']['columns'][col]['distinct']) {
           x.push(distinct);
           y.push(g['summary']['columns'][col]['distinct'][distinct]);
        }
        converted = [ {
           x: x,
           y: y,
           type: 'bar'
        } ];
        layout = { title: g['data']['meta']['header'][col], xaxis: { type: 'category'}, margin: { r: 0, pad: 0 } };
      }
      else { // numeric
        converted = [{ x: cols[col], type: 'histogram' }];
        layout = { title: g['data']['meta']['header'][col], xaxis: {}, margin: { r: 0, pad: 0 } };
      }
      target = $('#distributions').append('<div class="col-md-' + COLS_PER_GRAPH + '"><div id="dist_' + col + '" style="width: ' + width + 'px"></div></div>');
      Plotly.plot("dist_" + col, converted, layout, {displayModeBar: false});
    }
  },
  
  show_mds = function() {
  },

  one_hot = function() {
    // converts all data to numeric by one hot encoding categorical
    var result = [],
      new_row;
    for (row in g['data']['data']) { // 0..row
      new_row = [];
      for (col in g['data']['data'][row]) { // 0..col
        if (g['summary']['datatype'][col] == 'categorical') {
          // add number of rows equal to distinct
          for (var key in g['summary']['columns'][col]['distinct'].keys()) { 
            if (key == g['data']['data'][row][col]) {
              new_row.push(1);
            }
            else {
              new_row.push(0);
            }
          }
        }
        else {
          new_row.push(Number(g['data']['data'][row][col])); // unchanged
        }
      }
      result.push(new_row);
    }
    return result;
  },

  normalize = function(data) {
    // calculate mean and sd of each column
    
    var result = [],
      cols = numeric.transpose(data),
      means = math.mean(cols, 1),
      sds = [];

    for (col in cols) {
      sds.push(math.std(cols[col]));
    }

    // apply
    for (row in data) { // 0..row
      new_row = [];
      for (col in data[row]) { // 0..col
        new_row.push((data[row][col] - means[col]) / sds[col]);
      }
      result.push(new_row);
    }
    return result;
  },

  pca_cov = function(X) {
    // Return matrix of all principal components as column vectors
    var m = X.length;
    var sigma = numeric.div(numeric.dot(numeric.transpose(X), X), m);
    return numeric.svd(sigma).U;
  },

  pca_svd = function(X) {
    // Return matrix of all principal components as column vectors
    var m = X.length;
    var sigma = numeric.div(numeric.dot(numeric.transpose(X), X), m);
    return numeric.svd(sigma).U;
  },

  show_pca = function() {
    var inp = normalize(one_hot()),
      eigenvectors = pca_svd(inp),
      transformer = [eigenvectors[0], eigenvectors[1]],
      transformed = numeric.dot(transformer, numeric.transpose(inp)); // 2 x d * d x n
    
    Plotly.plot("pca", [{ x: transformed[0], y: transformed[1], mode: 'markers', type: 'scatter' }], { title: 'PCA' }, {displayModeBar: false});
  },

  init_correlations = function() {
    for (header in g['data']['meta']['header']) {
      $('#correlation_feature').append($('<option>', {value:header, text:g['data']['meta']['header'][header]}));
    }
  },

  show_correlations = function() {
      const
      COLS_PER_GRAPH = 6,
      MAX_CATEGORIES = 100;
    var 
      cols = numeric.transpose(g['data']['data']), 
      feature = $('#correlation_feature').val(),
      converted, x, y, layout,
      width = Math.round(COLS_PER_GRAPH/12 * $('.container').width());

    // clear existing plots if any
    $('#correlations div div').each(function () {
        if (this.id != '') {
          Plotly.purge(this.id);
        }
    });
    $('#correlations').empty();

    // check not too many categories (plot.ly can't handle)
    distinct_count = Object.keys(g['summary']['columns'][feature]['distinct']).length;
    if (g['summary']['datatype'][feature] == 'categorical' && distinct_count > MAX_CATEGORIES) {
      $('#correlations').html('<div class="alert alert-danger fade in">This feature has too many categories (<strong>' + distinct_count + '</strong>)</div>');
      return;
    }

    for (var col in g['data']['meta']['header']) { // 0.. cols
      if (col == feature) {
        continue;
      }
      // cat vs cat -> stacked bar
      if (g['summary']['datatype'][col] == 'categorical' && g['summary']['datatype'][feature] == 'categorical') { 
        counts = {}
        for (row in g['data']['data']) {
          feature_val = g['data']['data'][row][feature];
          x_val = g['data']['data'][row][col];
          if (!(feature_val in counts)) {
            counts[feature_val] = {}
          }
          if (!(x_val in counts[feature_val])) {
            counts[feature_val][x_val] = 0
          }
          counts[feature_val][x_val] += 1
        }
        // convert to traces - one trace per feature
        converted = [];
        for (current_feature_val in counts) {
          x = []; 
          y = [];
          for (current_x_val in counts[current_feature_val]) {
            x.push(current_x_val);
            y.push(counts[current_feature_val][current_x_val]);
          }
          converted.push({ 
            x: x,
            y: y,
            name: current_feature_val,
            type: 'bar'
          });
        }
        layout = { title: g['data']['meta']['header'][col], xaxis: { type: 'category' }, margin: { r: 0, pad: 0 }, barmode: 'stack' };
      }
      else if (g['summary']['datatype'][col] != 'categorical' && g['summary']['datatype'][feature] != 'categorical') { // num vs num -> scatter
        x = []; 
        y = [];
        for (row in g['data']['data']) {
          x.push(g['data']['data'][row][col])
          y.push(g['data']['data'][row][feature])
        }
        converted = [{ 
          x: x,
          y: y,
          mode: 'markers',
          type: 'scatter'
        }];
        layout = { title: g['data']['meta']['header'][col], xaxis: { title: g['data']['meta']['header'][col] }, yaxis: { title: g['data']['meta']['header'][feature] }, margin: { r: 0, pad: 0 }, barmode: 'stack' };
      }
      else if (g['summary']['datatype'][col] != 'categorical' && g['summary']['datatype'][feature] == 'categorical') { // col-numeric (x) vs feature-cat (y)
        counts = {}
        for (row in g['data']['data']) {
          feature_val = g['data']['data'][row][feature];
          x_val = g['data']['data'][row][col];
          if (!(feature_val in counts)) {
            counts[feature_val] = [];
          }
          if ($.isNumeric(x_val)) { // plot.ly doesn't like empty values
            counts[feature_val].push(x_val);
          }
        }
        // convert to traces - one trace per feature
        converted = [];
        for (current_feature_val in counts) {
          if (counts[current_feature_val].length > 0) {
            converted.push({
              x: counts[current_feature_val],
              name: current_feature_val,
              type: 'histogram'
            });
          }
        }
        layout = { title: g['data']['meta']['header'][col], xaxis: {}, margin: { r: 0, pad: 0 }, barmode: 'stack', yaxis: { title: 'Count' }};
      }
      else { // cat (x) vs num (y)
        col_distinct_count = Object.keys(g['summary']['columns'][col]['distinct']).length;
        if (col_distinct_count > MAX_CATEGORIES) {
          // TODO tell user
          continue;
        }
        counts = {}
        for (row in g['data']['data']) {
          feature_val = g['data']['data'][row][feature];
          x_val = g['data']['data'][row][col];
          if (!(x_val in counts)) {
            counts[x_val] = []
          }
          counts[x_val].push(feature_val)
        }
        // convert to traces - one trace per feature
        converted = [];
        for (current_x_val in counts) {
          converted.push({ 
            y: counts[current_x_val],
            name: current_x_val,
            type: 'box',
            boxpoints: 'Outliers'
          });
        }
        layout = { title: g['data']['meta']['header'][col], xaxis: { type: 'category', title: g['data']['meta']['header'][col] }, yaxis: { title: g['data']['meta']['header'][feature] }, margin: { r: 0, pad: 0 }};
      }
      $('#correlations').append('<div class="col-md-' + COLS_PER_GRAPH + '"><div id="corr_' + col + '" style="width: ' + width + 'px"></div></div>');
      Plotly.plot("corr_" + col, converted, layout, {displayModeBar: false});
    }
  },

  init_prediction = function() {
    $('#outcome').empty();
    for (header in g['data']['meta']['header']) {
      $('#outcome').append($('<option>', {value:header, text:g['data']['meta']['header'][header]}));
    }
    show_predictors();
    update_excluded();
  },

  update_excluded = function() {
    var excluded_list = [];
    for (header in g['data']['meta']['header']) {
      if (g['excluded_cols'].has(parseInt(header))) {
        excluded_list.push(g['data']['meta']['header'][header]);
      }
    }
    if (excluded_list.length == 0) {
      $('#prediction_config').html('<div class="alert alert-info">All inputs will be included in the analysis.</div>');
    }
    else {
      $('#prediction_config').html('<div class="alert alert-info"><strong>Excluded inputs:</strong> ' + excluded_list.join(', ') + '</div>');
    }
  }

  show_predictors = function() {
    var outcome_datatype = g['summary']['datatype'][$('#outcome').val()];
    $('#predictor').empty();
    for (predictor in ml) {
      if (outcome_datatype == ml[predictor]().datatype) {
        $('#predictor').append('<option value="' + predictor + '">' + ml[predictor]().name + '</option>');
      }
    }
  },

  show_prediction = function() {
    var predictor = ml[$('#predictor').val()](),
      outcome_datatype = g['summary']['datatype'][$('#outcome').val()],
      distinct = {};
    for (column in g['summary']['columns']) {
      distinct[column] = Object.keys(g['summary']['columns'][column]['distinct']).length;
    }
    $('#prediction_result').html('<div class="alert alert-info">Processing...</div>')
    predictor.fit(g['data']['data'], g['excluded_rows'], $('#outcome').val(), g['excluded_cols'], g['summary']['datatype'], distinct, prediction_result_callback, prediction_result_callback_error);
  },

  prediction_result_callback_error = function() {
      $('#prediction_result').html('<div class="alert alert-danger alert-dismissable">An error occurred. Prediction failed.</div>')
  },

  prediction_result_callback = function(result) { // training_score, cross_validation_score, predictions) {
    var predictor = ml[$('#predictor').val()](),
      outcome_datatype = g['summary']['datatype'][$('#outcome').val()]
    Plotly.purge(document.getElementById('confusion'));
    if ('error' in result) {
      $('#prediction_result').html('<div class="alert alert-danger alert-dismissable">Error: ' + result['error'] + '</div>');
    }
    else if (outcome_datatype == 'categorical') {
      $('#prediction_result').html('<div class="alert alert-info alert-dismissable"><strong>Training accuracy: </strong>' + ((result['training_score'] * 100).toFixed(1)) + '%<br/>' +
        '<strong>Cross validation accuracy: </strong>' + ((result['cross_validation_score'] * 100).toFixed(1)) + '%</div>');
      // confusion matrix
      if ('confusion' in result) {
        // normalize
        var z = [];
        result['confusion'].forEach(function(el) {
          var zr = [], 
            total = math.sum(el);
          el.forEach(function(c) {
            zr.push((100 * c / total).toFixed(1) + '%');
          })
          z.push(zr);
        });

        data = [{
          x: result['y_labels'],
          y: result['y_labels'],
          z: result['confusion'],
          type: 'heatmap'
        }];
        layout = {title: 'Confusion Matrix', xaxis: {title: 'Predicted Class', type: 'category'}, yaxis: {title: 'Actual Class', type: 'category'}, annotations: []};
        // show values
        for ( var i = 0; i < result['y_labels'].length; i++ ) {
          for ( var j = 0; j < result['y_labels'].length; j++ ) {
            var annotation = {
              xref: 'x1',
              yref: 'y1',
              x: result['y_labels'][j],
              y: result['y_labels'][i],
              text: z[i][j],
              showarrow: false,
              font: {
                color: 'white'
              }
            }
            layout.annotations.push(annotation);
          }
        }
        Plotly.plot("confusion", data, layout, {displayModeBar: false});
      }
    }
    else {
      $('#prediction_result').html('<div class="alert alert-info alert-dismissable"><strong>Training R<sup>2</sup>: </strong>' + (result['training_score'].toFixed(2)) + '<br/>' +
        '<strong>Cross validation R<sup>2</sup>: </strong>' + (result['cross_validation_score'].toFixed(2)) + '</div>');
    }
  },

  select_overview = function() {
    if ( $(this).hasClass('excluded') ) {
      $(this).removeClass('excluded');
      column = $('#table_columns').DataTable().row(this)[0][0];
      g['excluded_cols'].delete(column);
    }
    else {
      $(this).addClass('excluded');
      column = $('#table_columns').DataTable().row(this)[0][0];
      g['excluded_cols'].add(column);
    }
    update_excluded();
  },

  run_queue = function() {
    if (g['queue'].length > 0) {
      g['queue'].shift()();
      setTimeout(run_queue, 5);
    }
  },

  process = function(data) {
    g['data'] = data;
    g['queue'] = [
      show_overview,
      calculate_summary,
      show_columns,
      show_missing,
      show_column_dists,
      init_correlations,
      show_correlations,
      init_prediction,
    ];

    run_queue();

    $('#correlation_feature').change(show_correlations);
    $('#outcome').change(show_predictors);
    $('#run_predictor').click(show_prediction);

  };
