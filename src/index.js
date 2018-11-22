import './css/styles.css'
import { Map, View, Overlay } from 'ol'
import { fromLonLat } from 'ol/proj'
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer'
import { OSM, Vector as VectorSource } from 'ol/source'
import GeoJSON from 'ol/format/GeoJSON'
import Text from 'ol/style/Text'
import CircleStyle from 'ol/style/Circle'
import { Style, Stroke, Fill } from 'ol/style'
import { colors, printDetails, printStats, calculateStats } from './utils'

// The WFS provided by EyeOnWater.org for Australia data
const WFS_URL = 'http://geoservice.maris2.nl/wms/project/eyeonwater_australia?service=WFS&version=1.0.0&request=GetFeature&typeName=eow_australia&maxFeatures=5000&outputFormat=application%2Fjson'

let map = null
const styleCache = {}

let popup = new Overlay({
  element: document.getElementById('popup'),
  position: [0, 0],
  positioning: 'center-center'
})

// Style Features using ..... FU values (called for each feature on every render call)
const basicStyle = function (feature, resolution) {
  const fuValue = feature.get('fu_value')
  const styleKey = `${fuValue}_${resolution}`
  // Avoid some unnecessary computation
  if (styleCache[styleKey]) {
    return styleCache[styleKey]
  }

  const styleOptions = {
    image: new CircleStyle({
      radius: map.getView().getZoom() * Math.log2(5),
      stroke: new Stroke({
        color: 'white'
      }),
      fill: new Fill({
        color: colors[fuValue]
      })
    })
  }
  // Show fu value when zoomed in close
  if (resolution < 20) {
    styleOptions.text = new Text({
      text: `${fuValue}`,
      fill: new Fill({
        color: 'white'
      })
    })
  }

  styleCache[styleKey] = new Style(styleOptions)
  return styleCache[styleKey]
}

const dataLayer = new VectorLayer({
  source: new VectorSource({
    format: new GeoJSON(),
    url: WFS_URL
  }),
  style: basicStyle
})

dataLayer.getSource().on('change', ({ target }) => {
  // Populate datalayer
  document.querySelector('.sub-header-stats').innerHTML = printStats(calculateStats(target.getFeatures()))
})

map = new Map({
  target: 'map',
  layers: [
    new TileLayer({
      source: new OSM()
    }),
    dataLayer
  ],
  view: new View({
    center: fromLonLat([133.07421121913038, 28.566680043403878]),
    zoom: 2
  })
})

// Attach overlay and hide it
map.addOverlay(popup)
popup.setVisible(false)

// add some events
popup.getElement().addEventListener('click', function (event) {
  if (event.target.matches('.close')) {
    popup.setVisible(false)
    popup.getElement().classList.remove('active')
  }

  if (event.target.matches('.popup-item')) {
    const element = event.target
    element.classList.toggle('active')
  }
}, false)

// Show popup with features at certain point on the map
map.on('click', function (evt) {
  const {
    pixel,
    coordinate
  } = evt

  // clean up old popup and initilize some variables
  popup.setVisible(false)
  const element = popup.getElement()
  const content = element.querySelector('.content')
  const stats = element.querySelector('.stats')
  content.innerHTML = ''
  element.classList.remove('active')

  const features = []

  map.forEachFeatureAtPixel(pixel, function (feature) {
    features.push(feature)
  })

  if (features.length) {
    content.innerHTML = features.map(printDetails).join('')
    stats.innerHTML = printStats(calculateStats(features))
    element.classList.add('active')
    popup.setPosition(coordinate)
  }
})

console.log('App loaded successfully...')
