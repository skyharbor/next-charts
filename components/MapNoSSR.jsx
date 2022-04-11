import { useEffect, useState, useRef } from "react";
import L from "leaflet";
// import pixiOverlay from "leaflet-pixi-overlay";
import "leaflet/dist/leaflet.css";
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css";
import "leaflet-defaulticon-compatibility";
import * as topojson from "topojson";
import { scaleLinear } from "d3-scale";
import leafletPip from "@mapbox/leaflet-pip";

//extend Leaflet to create a GeoJSON layer from a TopoJSON file
L.TopoJSON = L.GeoJSON.extend({
  addData: function (data) {
    var geojson, key;
    if (data.type === "Topology") {
      for (key in data.objects) {
        if (data.objects.hasOwnProperty(key)) {
          geojson = topojson.feature(data, data.objects[key]);
          L.GeoJSON.prototype.addData.call(this, geojson);
        }
      }
      return this;
    }
    L.GeoJSON.prototype.addData.call(this, data);
    return this;
  },
});
L.topoJson = function (data, options) {
  return new L.TopoJSON(data, options);
};

const topojsonFiles = {
  us: {
    ADM1: "/geoBoundaries-USA-ADM1_simplified.topojson",
    ADM2: "/geoBoundaries-USA-ADM2_simplified.topojson",
  },
  uk: {
    ADM1: "geoBoundaries-GBR-ADM1_simplified.topojson",
    ADM2: "geoBoundaries-GBR-ADM2_simplified.topojson",
  },
};

const MapNoSSR = () => {
  const [geoData, setGeoData] = useState(null);
  const [populationData, setPopulationData] = useState(null);
  const [lMap, setLMap] = useState(null);
  const [activeLevel, setActiveLevel] = useState("ADM1");
  const [activeCountry, setActiveCountry] = useState("US");
  const [centerPoint, setCenterPoint] = useState({});
  const mapRef = useRef(null);

  const mapPopulationCountry = (data) => {
    const population = new Map();
    const domain = [data[0].population, data[0].population];

    data.forEach((point) => {
      const populationNumber = Number(point.population);
      population.set(point.country, populationNumber);

      if (populationNumber < domain[0]) {
        domain[0] = populationNumber;
      }

      if (populationNumber > domain[1]) {
        domain[1] = populationNumber;
      }
    });

    setPopulationData({
      ...populationData,
      ADM0: { population, domain },
    });
  };

  const mapPopulationCounty = (data) => {
    const population = new Map();
    const domain = [data[0].population, data[0].population];

    data.forEach((point) => {
      const populationNumber = Number(point.population);
      population.set(point.subregion || point.region, populationNumber);

      if (populationNumber < domain[0]) {
        domain[0] = populationNumber;
      }

      if (populationNumber > domain[1]) {
        domain[1] = populationNumber;
      }
    });

    setPopulationData({
      ...populationData,
      ADM2: { population, domain },
    });
  };

  const mapPopulationState = (data) => {
    const population = new Map();
    const domain = [data[0].POPESTIMATE2019, data[0].POPESTIMATE2019];

    data.forEach((point) => {
      const populationNumber = Number(point.POPESTIMATE2019);
      population.set(point.STATE, populationNumber);

      if (populationNumber < domain[0]) {
        domain[0] = populationNumber;
      }

      if (populationNumber > domain[1]) {
        domain[1] = populationNumber;
      }
    });

    setPopulationData({
      ...populationData,
      ADM1: { population, domain },
    });
  };

  async function getData(url) {
    const response = await fetch(url);
    const data = await response.json();

    return data;
  }

  useEffect(() => {
    getData("/geoBoundaries-USA-ADM1_simplified.topojson").then((data) =>
      setGeoData({
        ...geoData,
        ADM1: data,
      })
    );
    // getData("/population.json").then((data) => mapPopulationCounty(data));
    getData("/population_state.json").then((data) => mapPopulationState(data));

    if (mapRef.current && !lMap) {
      const map = L.map(mapRef.current, {
        center: [39, -100],
        zoom: 5,
      })
        .on("zoomend", function (e) {
          const zoomLevel = e.target._zoom;

          if (zoomLevel > 7) {
            setActiveLevel("ADM2");
          } else if (zoomLevel > 4) {
            setActiveLevel("ADM1");
          } else {
            setActiveLevel("ADM0");
          }
        })
        .on("moveend", function () {
          setCenterPoint(map.getCenter());
        });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        id: "openstreetmap",
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      setLMap(map);
    }
  }, []);

  // fetch active geo data
  useEffect(() => {
    if (activeLevel === "ADM2" && !geoData.ADM2) {
      getData("/geoBoundaries-USA-ADM2_simplified.topojson").then((data) =>
        setGeoData({
          ...geoData,
          ADM2: data,
        })
      );
    }

    if (activeLevel === "ADM0" && !geoData.ADM0) {
      getData("/world-countries.topojson").then((data) =>
        setGeoData({
          ...geoData,
          ADM0: data,
        })
      );
    }
  }, [activeLevel, geoData]);

  // fetch active population data
  useEffect(() => {
    if (activeLevel === "ADM2" && !populationData.ADM2) {
      getData("/population.json").then((data) => mapPopulationCounty(data));
    }

    if (activeLevel === "ADM0" && !populationData.ADM0) {
      getData("/population_country.json").then((data) =>
        mapPopulationCountry(data)
      );
    }
  }, [activeLevel, populationData]);

  useEffect(() => {
    if (lMap && geoData && populationData && populationData[activeLevel]) {
      const getStyle = (feature) => {
        const populationNumber = populationData[activeLevel].population.get(
          feature.properties.shapeName || feature.properties.name
        );

        const range = ["white", "red"];
        const color = scaleLinear(populationData[activeLevel].domain, range);

        const defaultStyle = { weight: 1, opacity: 0.2, fillOpacity: 0.6 };

        return {
          ...defaultStyle,
          fillColor: populationNumber ? color(populationNumber) : range[0],
          color: "red",
        };
      };

      if (geoData[activeLevel]) {
        lMap.eachLayer(function (layer) {
          if (layer.options.id !== "openstreetmap") {
            lMap.removeLayer(layer);
          }
        });

        //create an empty geojson layer
        //with a style and a popup on click
        var geojson = L.topoJson(null, {
          style: (feature) => getStyle(feature),
          onEachFeature: (feature, layer) => {
            const populationNumber = populationData[activeLevel].population.get(
              feature.properties.shapeName || feature.properties.name
            );

            layer.bindPopup(
              `<p>${
                feature.properties.shapeName || feature.properties.name
              }: ${new Intl.NumberFormat().format(populationNumber)}</p>`
            );
          },
        }).addTo(lMap);

        geojson.on("click", function (e) {
          const countryCode = e.layer.feature.properties["Alpha-2"];
          console.log(countryCode);

          if (countryCode === "US") {
            setActiveLevel("ADM1");
          }
        });

        geojson.addData(geoData[activeLevel]);

        var results = leafletPip.pointInLayer(centerPoint, geojson, true);
        console.log(results[0]?.feature.properties.name);
      }

      // L.geoJSON(geoData, { style: getStyle }).addTo(lMap);
    }
  }, [lMap, geoData, populationData, activeLevel, centerPoint]);

  return (
    <div ref={mapRef} id="map" style={{ height: "100%", width: "100%" }}></div>
  );
};

export default MapNoSSR;
