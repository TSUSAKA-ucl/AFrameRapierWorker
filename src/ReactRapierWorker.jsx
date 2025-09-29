import { useEffect, useRef } from 'react'
import AFRAME from 'aframe'
const THREE = window.AFRAME.THREE;

// *****************
// global references to the worker and the objects
export let globalWorkerRef = null;
export let globalObjectsRef = null;
export let globalDestinationsRef = null;
export let globalFrameCounter = null;

// *****************
// function(s) to define A-Frame objects from the Rapier object definitions
// they are called when the Rapier worker sends the object definitions
// :
function defineObject(objDef) {
  const sceneEl = document.querySelector('a-scene');
  if (!sceneEl) return null;
  let el = null;
  const elAttrs = {};
  console.log("Defining object:", objDef.id, "shape:", objDef.shape);
  switch (objDef.shape) {
  case 'box': {
    el = document.createElement('a-box');
    elAttrs.width = objDef.size.x;
    elAttrs.height = objDef.size.y;
    elAttrs.depth = objDef.size.z;
  }
    break;
  case 'cylinder': {
    // console.log("Creating cylinder with size: ", objDef.size);
    el = document.createElement('a-cylinder');
    elAttrs.height = objDef.size.height;
    elAttrs.radius = objDef.size.radius;
  }
    break;
  case 'sphere': {
    el = document.createElement('a-sphere');
    elAttrs.radius = objDef.size.radius;
  }
    break;
  default:
    console.warn("Unknown shape:", objDef.shape);
  }
  if (!el) return null;
  elAttrs.color = objDef.color || 'gray';
  el.setAttribute('id', objDef.id);
  Object.entries(elAttrs).forEach(([k,v])=>el.setAttribute(k,v));
  if (objDef.pose) {
    el.object3D.position.set(objDef.pose[0], objDef.pose[1], objDef.pose[2]);
    el.object3D.quaternion.set(objDef.pose[4], objDef.pose[5], objDef.pose[6],
                               objDef.pose[3]);
  }
  sceneEl.appendChild(el);
  return el;
}

AFRAME.registerComponent('rapier-tick', {
  tick: function () {
    if (globalObjectsRef && globalDestinationsRef) {
      // console.log("Updating Rapier objects poses. number of objects:",
      //             Object.keys(globalObjectsRef.current).length);
      for (const [id, el] of Object.entries(globalObjectsRef.current)) {
	const p = globalDestinationsRef.current[id];
	if (p) {
	  el.object3D.position.copy(new THREE.Vector3(p[0], p[1], p[2]));
	  el.object3D.quaternion.copy(new THREE.Quaternion(p[4], p[5], p[6], p[3]));
	}
      }
    }
    if (globalFrameCounter) globalFrameCounter.current += 1;
  }
});
// ****************
// the entry point
// :
function RapierWorker() {
  // *****************
  // A-Frame component to update the Rapier objects poses
  // :
  // Even if you update the poses within the requestAnimationFrame
  // animation loop, the poses will not be reflected in (only) Quest VR mode,
  // so it is recommend to update them using the a-scene tick function.
  // :
  useEffect(() => {
    const sceneEl = document.querySelector('a-scene');
    if (!sceneEl) {
      console.warn("No a-scene found");
      return;
    } else {
      console.log("a-scene found");
    }
    // console.log("a-scene FOUND, setting up tick function");
    const onAsceneLoaded = () => {
      console.log("a-scene LOADED, setting up tick function");
      console.debug("a-scene tick functions is ",sceneEl.tick);
      const newEl = document.createElement('a-entity');
      newEl.setAttribute('rapier-tick', '');
      sceneEl.appendChild(newEl);
    };
    if (sceneEl.hasLoaded) {
      onAsceneLoaded();
    } else {
      sceneEl.addEventListener('loaded', onAsceneLoaded);
      return () => {
	sceneEl.removeEventListener('loaded', onAsceneLoaded);
      }
    }
  }, []);
  // ****************
  // Rapier worker
  const workerRef = useRef(null);
  globalWorkerRef = workerRef;
  const objectsRef = useRef({});
  globalObjectsRef = objectsRef;
  const destinationsRef = useRef({});
  globalDestinationsRef = destinationsRef;
  globalFrameCounter = useRef(0);
  useEffect(() => {
    workerRef.current = new Worker('/rapier-worker.mjs', {type: 'module'});
    const worker = workerRef.current;
    worker.onmessage = (e) => {
      switch (e.data.type) {
      case 'definition': {
        const el = defineObject(e.data);
        if (el) {
	  objectsRef.current[e.data.id] = el;
          destinationsRef.current[e.data.id] = e.data.pose;
	}
        break;
      }
      case 'poses':
        if (e.data.id && e.data.pose) {
          destinationsRef.current[e.data.id] = e.data.pose;
          // console.log("Positions:", e.data.pose[0], e.data.pose[1]);
        }
        break;
      }
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
      Object.values(objectsRef.current).forEach((el) => {
	if (el.parentNode) {
	  el.parentNode.removeChild(el);
	}
      });
    }
  }, []);
  return null;
}

export default RapierWorker
