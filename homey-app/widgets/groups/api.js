'use strict';

// Data for the Circuits widget

module.exports = {
  async getGroups({ homey }) {
    return homey.app.getWidgetGroups();
  },
};
