# [APP][Pro] Energy Dashboard – a live energy display for any screen in your home

Hi all,

I built an app that turns any screen in your home into a live energy dashboard. Homey Pro serves the dashboard as a web page on your own network, so a tablet on the wall, a laptop or your phone only needs a browser. You don't need an extra computer, a cloud account or an API key. There are also two widgets for Homey's own Dashboards.

**The app is in test now, and I'm looking for testers.** Install it here:
https://homey.app/a/com.drpeppers.energydashboard/test/

![Dashboard in dark mode](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/dashboard-dark.png)

## Highlight: see where every kWh goes

The block I'm most happy with is **Energy flows**, a Sankey chart. In one picture it shows where your energy comes from, where it goes and which devices use it. The thickness of each band is the amount of energy, so the big users stand out at once.

- **Left:** the sources: solar, grid and home battery.
- **Middle:** your home, plus what went out again: exported to the grid and charged into the battery. Here you see at a glance how much of your solar you used yourself.
- **Right:** every device with an energy meter in Homey, from the EV charger and heat pump to the fridge and the network cabinet. What the devices don't account for is shown as **Not measured**, so the numbers always add up and you see how much is still unknown.

It has two modes. **Live** shows the power right now in watts, with particles flowing along the bands. **Period** shows the energy in kWh for today, yesterday, the week, the month or the year. Point at a band to see its exact value.

![Energy flows, live](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/energy-flows.png)

![Energy flows, this month](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/energy-flows-month.png)

Over a month, this is where you find the surprises: the fridge that uses as much as the washing machine, or how much of your solar ends up in the car.

## What else it shows

The dashboard is made of blocks that you arrange yourself: drag them around, change their width and height, or hide them. Blocks for a home battery, EV charger or heat pump appear by themselves once Homey has a matching device.

**Energy now**: the live flow between solar, grid, home and home battery. Moving particles show where the power goes; they speed up with more power.

![Energy now](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/energy-now.png)

**Power today**: the power through the day, in the style of the HomeWizard app. Solar you used yourself is at the bottom. Grid import is stacked on top of it, so its top edge is your consumption. Export is stacked the same way, so its top edge is everything your panels produced. Pointing at the chart shows the values at that moment. With the solar forecast turned on, a dashed line shows the expected solar power. This also works for P1 meters that don't log power in Insights: the app then calculates it from the meter readings.

![Power chart](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/power-chart.png)

**Costs, with your own contract**: a fixed contract (normal and off-peak rate) or a dynamic one. For a dynamic contract the price per quarter hour is the market price plus energy tax plus your supplier's markup. You can pick one of nineteen suppliers to fill in its usual markup, but please check the amounts against your own contract. Costs are calculated with the price of each quarter hour, so they match a dynamic contract. The block shows import, export, gas, water and fixed costs, compared with the previous period.

![Costs](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/costs.png)

![Prices](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/prices.png)

**End of net metering**: net metering (salderen) ends on 1 January 2027. Based on your own data from the past year, this block shows roughly what that will cost you per year, and what each kWh you use yourself instead of exporting saves.

![End of net metering](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/netting.png)

**Home battery**: charge level, charged and discharged energy, how much came from solar, and what the battery earns you, with and without net metering.

![Home battery](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/battery.png)

**Solar energy**: the yield per day, week, month or year against the forecast, with the performance, yield per kWp, the best day and a line per inverter.

![Solar energy](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/solar.png)

**Warnings**: devices that have been on for longer than you'd expect, and standby use that is higher than usual. Optionally also in the Homey timeline, at most once a day per warning.

![Warnings](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/alerts.png)

And more:
- Totals per day, week, month or year: consumption, import, solar, export, gas, water, self-sufficiency and costs, compared with the previous period
- Charts for electricity, gas and water; gas also per degree day, so a cold month doesn't look like a bad month
- Hot water: temperature and estimated shower minutes of your water heater (made with the Atag Lydos Hybrid in mind)
- Heating and EV charger
- Use per device, standby use and phase load
- Export the chosen period as CSV

It works in light and dark mode, on any screen size, in English and Dutch (switch at the top right).

![Light mode](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/dashboard-light.png)

<img src="https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/phone-nl.png" alt="On a phone" width="300">

## Widgets for Homey Dashboards

**Energy flows** shows live where your power comes from, which rooms use it, and the devices using the most per room. **Energy now** is a compact version of the live flow between solar, grid, home and battery. Both are kept light: Homey only sends a small list of values and the widget draws them itself.

<img src="https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/widget.png" alt="Energy flows widget" width="400"> <img src="https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/widget-now.png" alt="Energy now widget" width="400">

## For a tablet on the wall

- Each screen can have its own layout: save a layout under a name and open the dashboard with `?layout=<name>` behind the address.
- Add the dashboard to the home screen of a tablet or phone to open it like an app, without the browser bar.
- With the screen icon at the top right: full screen, keep the screen on, and night mode (dim the screen or turn it black between two times; a tap wakes it for a minute).

The page moves a few pixels now and then against burn-in, and reloads itself after an app update.

## How it works

- Devices are found automatically through Homey Energy: a P1 meter, solar panels, a home battery, a water heater, heating, an EV charger and a water meter. You can also pick them yourself in the app settings.
- History comes from Homey Insights. Market prices come from EnergyZero, the solar forecast from Forecast.Solar and the outside temperature for degree days from Open-Meteo (all free, no account). Nothing about your usage leaves your network.
- The app settings show the address of the dashboard (by default `http://<homey-ip>:8080`).
- Protect the dashboard with an access code, and editing the layout with a PIN. Please set an access code if you make the dashboard reachable from outside your home.

## Requirements

- Homey Pro with Homey 12.3 or later
- A P1 meter for the live and power views; solar panels, a battery and the other devices are optional
- Prices and costs with a dynamic contract are for the Netherlands (EnergyZero)

## Feedback

This is a test version, so I'd love to hear how it works with your devices, especially other P1 meters, inverters, home batteries and EV chargers. If something isn't found or looks wrong, please post here or open an issue on GitHub:
https://github.com/WNijhof/homey-energy-dashboard/issues

Source code: https://github.com/WNijhof/homey-energy-dashboard
