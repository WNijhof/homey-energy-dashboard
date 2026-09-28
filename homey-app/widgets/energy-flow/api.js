'use strict';

// Data for the Energy flows widget

module.exports = {
  async getFlow({ homey, query }) {
    return homey.app.getWidgetFlow({ perZone: query.perZone });
  },
};
