#!/usr/bin/env python
'''
  statistical learning and analysis methods
'''

import collections
import csv
import json

import sklearn.ensemble
import sklearn.linear_model
import sklearn.svm
import sklearn.model_selection

MAX_DISTINCT = 100

def evaluate(data_fh, config, learner):
    # x_exclude, y_predict, y_exclude, scale?
    y_exclude = set([int(x) for x in json.loads(config['y_exclude'])])
    x_exclude = set([int(x) for x in json.loads(config['x_exclude'])])
    y_predict = int(config['y_predict'])
    categorical_cols = set([i for i, x in enumerate(json.loads(config['datatype'])) if x == 'categorical'])
    distinct = { int(k): v for k, v in json.loads(config['distinct']).items() }

    # exclude columns with too many distincts
    for i in distinct.keys():
      if distinct[i] > MAX_DISTINCT:
        y_exclude.add(i)

    skipped = 0

    X = []
    y = []
    meta = {}

    seen = collections.defaultdict(dict)
    seen_count = collections.defaultdict(int)
    
    for lines, row in enumerate(csv.reader(data_fh)):
      if lines in x_exclude:
        continue
      if lines == 0:
        meta['header'] = row
        continue
      if len(row) == 0: # skip empty lines
        continue
      if row[0].startswith('#'):
        continue
 
      # one hot and exclusions
      x = []
      missing = False
      for idx, cell in enumerate(row): # each col
        if idx not in y_exclude and idx != y_predict:
          if idx in categorical_cols:
            chunk = [0] * distinct[idx]
            if cell in seen[idx]:
              chunk[seen[idx][cell]] = 1
            else:
              chunk[seen_count[idx]] = 1
              seen[idx][cell] = seen_count[idx]
              seen_count[idx] += 1
            x.extend(chunk)
          elif cell == '': # TODO don't handle missing float
            missing = True
            break
          else:
            x.append(float(cell))

      if missing:
        skipped += 1
        continue

      if y_predict in categorical_cols:
        y.append(row[y_predict])
      elif row[y_predict] == '':
        skipped += 1
        continue
      else:
        y.append(float(row[y_predict]))

      X.append(x)

    # scale
    if 'scale' in config:
      X = sklearn.preprocessing.scale(X)

    learner.fit(X, y)
 
    if y_predict in categorical_cols: # use accuracy
      scores = sklearn.model_selection.cross_val_score(learner, X, y, cv=5, scoring='accuracy')
      print(scores)
      result = {
        'skipped': skipped,
        'training_score': learner.score(X, y),
        'cross_validation_score': scores.mean()
      }
    else: # use MSE
      scores = sklearn.model_selection.cross_val_score(learner, X, y, cv=5, scoring='r2')
      print(scores)
      result = {
        'skipped': skipped,
        'training_score': learner.score(X, y),
        'cross_validation_score': scores.mean()
      }

    return result

def logistic_regression(data_fh, config):
    return evaluate(data_fh, config, sklearn.linear_model.LogisticRegression(C=1e5))

def svc(data_fh, config):
    return evaluate(data_fh, config, sklearn.svm.LinearSVC())

def random_forest(data_fh, config):
    return evaluate(data_fh, config, sklearn.ensemble.RandomForestClassifier())


def linear_regression(data_fh, config):
    return evaluate(data_fh, config, sklearn.linear_model.LinearRegression())

def svr(data_fh, config):
    return evaluate(data_fh, config, sklearn.svm.LinearSVR())


METHODS = {
  'logistic': logistic_regression,
  'svc': svc,
  'rf': random_forest,
  'linear': linear_regression,
  'svr': svr
}

