import './styles.css'
import { boot } from './game/world'

const app = document.getElementById('app')
if (!app) document.body.textContent = 'NOONSWORN failed to start.'
else boot(app)
