// Generated by CoffeeScript 1.8.0
var CozyInstance, americano;

americano = require(MODEL_MODULE);

module.exports = CozyInstance = americano.getModel('CozyInstance', {
  id: {
    type: String
  },
  domain: {
    type: String
  },
  locale: {
    type: String
  }
});

CozyInstance.first = function(callback) {
  return CozyInstance.request('all', function(err, instances) {
    if (err) {
      return callback(err);
    } else if (!instances || instances.length === 0) {
      return callback(null, null);
    } else {
      return callback(null, instances[0]);
    }
  });
};

CozyInstance.getURL = function(callback) {
  return CozyInstance.first(function(err, instance) {
    var url;
    if (err) {
      return callback(err);
    } else if (instance != null ? instance.domain : void 0) {
      url = instance.domain.replace('http://', '').replace('https://', '');
      return callback(null, "https://" + url + "/");
    } else {
      return callback(new Error('No instance domain set'));
    }
  });
};

CozyInstance.getLocale = function(callback) {
  return CozyInstance.first(function(err, instance) {
    return callback(null, (instance != null ? instance.locale : void 0) || 'en');
  });
};
