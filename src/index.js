import './css/styles.css'
import orderBy from 'lodash/orderBy'
import debounce from 'lodash/debounce'
import keyBy from 'lodash/keyBy'
import groupBy from 'lodash/groupBy'

import {
  DateTime
} from 'luxon'
import {
  Map,
  View,
  Overlay
} from 'ol'
import {
  fromLonLat
} from 'ol/proj'
import {
  Tile as TileLayer,
  Vector as VectorLayer
} from 'ol/layer'
import {
  OSM,
  Vector as VectorSource
} from 'ol/source'
import GeoJSON from 'ol/format/GeoJSON'
import Text from 'ol/style/Text'
import CircleStyle from 'ol/style/Circle'
import {
  Style,
  Stroke,
  Fill
} from 'ol/style'
import {
  colors,
  printDetails,
  printStats,
  calculateStats,
  renderUsers
} from './utils'

// The WFS provided by EyeOnWater.org for Australia data
const WFS_URL = 'https://geoservice.maris.nl/wms/project/eyeonwater_australia?service=WFS&version=1.0.0&request=GetFeature&typeName=eow_australia&maxFeatures=5000&outputFormat=application%2Fjson'
const USER_SERVICE = 'https://www.eyeonwater.org/api/users'
const styleCache = {}
let map = null
let allDataSource = new VectorSource({
  format: new GeoJSON(),
  url: WFS_URL
})
const userStore = {
  users: [],
  userById: {},
  getUserById (userId) {
    return this.userById[userId] || []
  }
}
const measurementStore = {
  measurements: [],
  measurementsById: {},
  measurementsByOwner: {},
  getByOwner (userId) {
    return this.measurementsByOwner[userId] || []
  },
  getById (id) {
    return this.measurementsById[id] || []
  }

}

function initialLoadMeasurements (event) {
  const source = event.target
  if (!source.loading) {
    const features = allDataSource.getFeatures()
    // Store the measurements in easy to access data structure
    measurementStore.measurements = features
    measurementStore.measurementsById = keyBy(features, f => f.get('n_code'))
    measurementStore.measurementsByOwner = groupBy(features, f => f.get('user_n_code'))

    recentMeasurements(measurementStore.measurements)
    // loadMeasurements().then((_measurements) => {

    // })
    allDataSource.un('change', initialLoadMeasurements)
  }
}

allDataSource.on('change', initialLoadMeasurements)

let popup = new Overlay({
  element: document.getElementById('popup'),
  position: [0, 0],
  autoPan: true,
  autoPanMargin: 275,
  positioning: 'bottom-center'
})

// Style Features using ..... FU values (called for each feature on every render call)
const basicStyle = function (feature, resolution) {
  const fuValue = feature.get('fu_value')
  const styleKey = `${fuValue}_${resolution}`
  // Avoid some unnecessary computation
  if (styleCache[styleKey]) {
    return styleCache[styleKey]
  }
  feature.set('visible', true)
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
  source: allDataSource,
  style: basicStyle
})

dataLayer.on('change', debounce(({
  target
}) => {
  // Populate datalayer
  document.querySelector('.sub-header-stats').innerHTML = printStats(calculateStats(target.getSource().getFeatures()), userStore)
}, 200))

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

  if (event.target.matches('.more-info-btn')) {
    const element = event.target.closest('.popup-item')
    element.classList.toggle('active')
  }
}, false)

document.getElementById('clearFilterButton').addEventListener('click', function (event) {
  clearFilter()
})

document.querySelectorAll('.pull-tab').forEach(i => i.addEventListener('click', function (event) {
  const element = event.target.closest('.panel')
  element.classList.toggle('pulled')
})
)

document.querySelector('.user-list').addEventListener('click', function (event) {
  const element = event.target.closest('.item')
  const userId = element.getAttribute('data-user')

  if (showMeasurements(userId)) {
    clearSelectedUser()
    element.classList.add('selectedUser', 'box-shadow')
    toggleFilterButton(true)
  }
}, true)

document.querySelector('.measurement-list').addEventListener('click', function (event) {
  const element = event.target.closest('.item')
  if (!element) {
    return
  }
  const coordinate = element.getAttribute('data-coordinate').split(',')
  const id = element.getAttribute('data-key')
  console.log(coordinate)
  // map.getView().setCenter(coordinate)
  // map.getView().setZoom(7)
  const view = map.getView()
  view.cancelAnimations()
  view.animate({
    center: coordinate,
    zoom: 7,
    duration: 1300
  })
  // clean up old popup and initilize some variables
  popup.setVisible(false)
  const popupElement = popup.getElement()
  const content = popupElement.querySelector('.content')
  const stats = popupElement.querySelector('.stats')
  content.innerHTML = ''
  popupElement.classList.remove('active')

  const features = [measurementStore.getById(id)]

  if (features.length) {
    content.innerHTML = features.map(printDetails).join('')
    stats.innerHTML = printStats(calculateStats(features), userStore)
    popupElement.classList.add('active')

    popup.setPosition(coordinate)
  }
}, true)

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
    stats.innerHTML = printStats(calculateStats(features), userStore)
    element.classList.add('active')
    popup.setPosition(coordinate)
  }
})

async function loadUsers () {
  const response = await window.fetch(USER_SERVICE)
  const {
    results: {
      users
    }
  } = await response.json()
  return users
}

loadUsers().then((_users) => {
  userStore.users = _users
  userStore.userById = keyBy(userStore.users, 'id')
  renderUsers(userStore.users)
})

function clearFilter () {
  dataLayer.setSource(allDataSource)
  clearSelectedUser()
  recentMeasurements(measurementStore.measurements)
  toggleFilterButton(false)
}

function showMeasurements (userId = null) {
  const newSource = new VectorSource()
  const selection = measurementStore.getByOwner(userId)
  if (!selection.length) {
    return false
  }
  newSource.addFeatures(selection)

  map.getView().fit(newSource.getExtent(), {
    size: map.getSize(),
    padding: [100, 100, 100, 100],
    nearest: false,
    duration: 1300
  })
  dataLayer.setSource(newSource)
  recentMeasurements(selection)
  return true
}

function toggleFilterButton (state = false) {
  const element = document.getElementById('clearFilterButton')
  element.classList.toggle('hidden', !state)
}

function clearSelectedUser () {
  document.querySelectorAll('.user-list .item').forEach(item => {
    item.classList.remove('selectedUser', 'box-shadow')
  })
}

export function recentMeasurements (measurements, n = 20) {
  const userList = orderBy(measurements, [(f) => (new Date(f.get('date_photo'))).getTime()], ['desc']).slice(0, n).map((measurement) => {
    let prettyDate = DateTime.fromISO(measurement.get('date_photo')).toLocaleString(DateTime.DATE_FULL)

    let itemTemplate = ` <li class="item measurement-item" data-coordinate="${measurement.getGeometry().getCoordinates()}" data-key="${measurement.get('n_code')}"><img src="https://eyeonwater.org/grfx/icons/small/${measurement.get('fu_value')}.png"> ${prettyDate}</li>`
    return itemTemplate
  })

  document.querySelector('.measurement-list ul').innerHTML = userList.join('\n')
}

console.log('App loaded successfully...')
