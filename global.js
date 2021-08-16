import { THREE } from "enable3d";

// ThreeMeshUI looks for a global variable.
window.global = window

// HoloPlay looks for a global THREE
window.THREE = THREE;

// Disable HoloPlay's "no device" alert
window.alert = () => {}
