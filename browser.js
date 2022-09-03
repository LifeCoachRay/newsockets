'use strict';

module.exports = function () {
  throw new Error(
    'Newsockets does not work in the browser. Browser clients must use the native ' +
      'newsockets object'
  );
};
