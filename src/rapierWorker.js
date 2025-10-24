import RAPIER from '@dimforge/rapier3d-compat'
import {isoMultiply, isoInvert} from './isometry3.js';
import {getRigidBody, storedBodies,
	storedJoints, storedFunctions, FunctionState,
	setStepTime} from './rapierObjectUtils.js'
const storedColliders = {};
const storedObjects = {};

async function loadUserConfig(path) {
  const module = await import(path);
  return module.default;
}

run_simulation();
async function run_simulation() {
  await RAPIER.init();
  const userConfig = await loadUserConfig('./physicalObj.config.js');

  // Use the RAPIER module here.
  let gravity = { x: 0.0, y: -9.81, z: 0.0 };
  let world = new RAPIER.World(gravity);
  self.world = world;

  // // Create the ground
  // let groundColliderDesc = RAPIER.ColliderDesc.cuboid(10.5, 0.1, 10.5);
  // const groundCollider = world.createCollider(groundColliderDesc);
  // const groundPlaneMsg = {type: 'definition', id: 'plane1', shape: 'cuboid',
  // 			  color: "#7BC8A4"};
  // writeCuboidSizeToMessage(groundCollider, groundPlaneMsg);
  // writePoseToMessage(groundCollider, groundPlaneMsg);
  // self.postMessage(groundPlaneMsg);
  
  userConfig.rigidBodies
    .filter(obj=>{return obj?.collider?.shape})
    .forEach(obj=>{
      primitiveCreateAndPost(obj.name, world,
			     obj.position, obj.orientation,
			     obj.collider,
			     obj?.type);
    });
  userConfig.joints
    ?.forEach(jnt=>{
      console.log("# Creating joint:", jnt);
      let jntParams = null;
      if (jnt?.type === 'prismatic') {
	jntParams = RAPIER.JointData.prismatic(jnt.anchorA,
					       jnt.anchorB,
					       jnt.axis);
      } else if (jnt?.type === 'revolute') {
	jntParams = RAPIER.JointData.revolute(jnt.anchorA,
					      jnt.anchorB,
					      jnt.axis);
      }
      if (jntParams) {
	if (jnt?.limits) {
	  jntParams.limitsEnabled = true;
	  jntParams.limits = jnt.limits;
	} else {
	  jntParams.limitsEnabled = false;
	}

	let jj1 = null;
	if (jnt?.modeling === 'reduction') {
	  jj1 = world.createMultibodyJoint(jntParams,
					   getRigidBody(jnt.bodyA),
					   getRigidBody(jnt.bodyB),
					   true);
	} else {
	  jj1 = world.createImpulseJoint(jntParams,
					     getRigidBody(jnt.bodyA),
					     getRigidBody(jnt.bodyB),
					 true);
	}
	if (jnt?.motor) {
	  const m = jnt.motor;
	  if (m?.type === 'position') {
	    console.log("### Configuring position motor:", m);
	    jj1.configureMotorPosition(m.targetPos, m.stiffness, m.damping);
	    console.log("### Motor configured.");
	  } else if (m?.type === 'velocity') {
	    console.log("### Configuring velocity motor:", m);
	    jj1.configureMotorVelocity(m.targetVel, m.damping);
	    console.log("### Motor configured.");
	  }
	}
	storedJoints[jnt.name] = jj1;
      }
    });
  // ****************
  function uniqueObjectName(base) {
    let name = base;
    let i = 1;
    while (storedObjects[name]) {
      name = base + "_" + i;
      i++;
    }
    return name;
  }
  userConfig.functions?.forEach(func=>{
    if (!func?.method || !func?.name) {
      console.warn("Function without method or name:", func);
      return;
    }
    const funcObj = {};
    if (func?.object) {
      if (!storedObjects[func.object]) {
	storedObjects[func.object] = {};
      }
      funcObj.object = storedObjects[func.object];
    } else {
      const objName = uniqueObjectName(func.name);
      storedObjects[objName] = {};
      funcObj.object = storedObjects[objName];
    }
    funcObj.object.method = func.method;
    if (func?.initialState) {
      funcObj.state = func.initialState;
    } else {
      funcObj.state = FunctionState.DORMANT;
    }
    storedFunctions[func.name] = funcObj;
  });
  // ****************
  // handling of the messages from the main thread
  let snapshot = null;
  let doStep = false;
  let singleStep = false;
  self.onmessage = (e) => {
    const data = e.data;
    switch (data.type) {
    case 'reset':
      if (snapshot) {
	console.log("Resetting simulation");
	world = RAPIER.World.restoreSnapshot(snapshot);
      }
      break;
    case 'stop':
      console.log("Stopping simulation");
      doStep = false;
      break;
    case 'start':
      console.log("Starting simulation");
      if (!doStep) {
	doStep = true;
	singleStep = false;
      }
      break;
    case 'step':
      if (!doStep) {
	singleStep = true;
	doStep = true;
      }
      break;
    case 'snapshot':
      if (!doStep) {
	snapshot = world.takeSnapshot();
	console.log("Snapshotting simulation");
      }
      break;
    case 'setNextPose':
      {
	const body = storedBodies[data.id];
	if (body) {
	  const position = new RAPIER.Vector3(data.pose[0], data.pose[1], data.pose[2]);
	  const orientation = new RAPIER.Quaternion(data.pose[3],
						    data.pose[4], data.pose[5], data.pose[6]);
	  setNextPose(body, position, orientation);
	}
      }
      break;
    case 'call': 
      console.log('*** rapierWorker dispatchs func. data:',data, 'arg:',data.args);
      setFuncStateAndArgs(data.name, FunctionState.SINGLE_SHOT, data.args);
      break;
    case 'activate':
      setFuncStateAndArgs(data.name, FunctionState.ACTIVE, data.args);
      break;
    case 'deactivate':
      setFuncStateAndArgs(data.name, FunctionState.STOPPED, data.args);
      break;
    case 'fix':
      fix(data.name, data.bodyA, data.bodyB);
      break;
    case 'release':
      release(data.name);
      break;
    default:
      console.warn("Worker: Unknown message", data);
    }
    function setFuncStateAndArgs(name, state, args) {
      if (!name) {
	console.warn("Function name slot is empty.");
	return;
      }
      const funcObj = storedFunctions[name];
      if (funcObj) {
	funcObj.state = state;
	if (args) {
	  funcObj.object.args = args;
	} else {
	  funcObj.object.args = {};
	}
      } else {
	console.warn("No such function to set state:", name);
      }
    }
  }
      
  // console.log('rigidBodies in the worker:', storedBodies);
  // ****************
  // Game loop. Replace by your own game loop system.
  let firstStep = true;
  // let changeJointMotor = true;
  snapshot = world.takeSnapshot();
  const workerTimeStep = 1.0 / 60.0;
  const loopTimeStep = workerTimeStep * 1000;
  world.timestep = workerTimeStep;
  let time = 0.0;
  let gameLoop = () => {
    // Step the simulation forward.  
    if (doStep) {
      setStepTime(world.timestep);
      world.step();
      if (firstStep) {
	firstStep = false;
	// The first step is the warm up step to propagate
	// the position corrections made by the joints.
	Object.keys(storedBodies).forEach((id) => {
	  storedBodies[id].setLinvel({x:0, y:0, z:0}, true);
	  storedBodies[id].setAngvel({x:0, y:0, z:0}, true);
	});
      }
      storedFunctions && Object.keys(storedFunctions).forEach((key) => {
	const funcObj = storedFunctions[key];
	if (funcObj.state === FunctionState.ACTIVE ||
	    funcObj.state === FunctionState.SINGLE_SHOT) {
	  funcObj.object.method(time, funcObj.object.args);
	  if (funcObj.state === FunctionState.SINGLE_SHOT) {
	    funcObj.state = FunctionState.STOPPED;
	  }
	}
      });
      time += workerTimeStep;
      if (singleStep) { doStep = false; singleStep = false; }
    }
    if (!snapshot) {
      snapshot = world.snapshot;
    }

    // if (time <= 5.0) {
    //   box1.setNextKinematicTranslation({x: -1.0*mag, y: 2.0*mag,
    // 					z: (-3.0 + 0.5*Math.sin(2.0*Math.PI*time))*mag});
    // }
    // if (time > 6.0) {
    //   if (changeJointMotor) {
    // 	joint5.configureMotorPosition(0.2, 0.0, 0.0);
    // 	joint6.configureMotorPosition(-0.2, 0.0, 0.0);
    // 	changeJointMotor = false;
    //   }
    // }
    // Get and post the rigid-bodies poses
    const msg = {type: 'poses', id: null, pose: null};
    Object.keys(storedBodies).forEach((id) => {
      msg.id = id;
      writePoseToMessage(storedBodies[id], msg);
      self.postMessage(msg);
    });
    setTimeout(gameLoop, loopTimeStep);
  };

  gameLoop();
}


// ********************************
// rapier colliderDesc creation
function createColliderDesc(colliderDef) {
  const size = colliderDef.size;
  switch (colliderDef?.shape) {
  case 'cuboid':
    colliderDef.shape = 'box';
  case 'box':
    return RAPIER.ColliderDesc.cuboid(size.x, size.y, size.z);
  case 'cylinder':
    return RAPIER.ColliderDesc.cylinder(size.halfHeight, size.radius);
  case 'ball':
    colliderDef.shape = 'sphere';
  case 'sphere':
    return RAPIER.ColliderDesc.ball(size.radius);
  case 'capsul':
    return RAPIER.ColliderDesc.capsule(size.halfHeight, size.radius);
  default:
    return null;
  }
}

// ********************************
// write collider size to aframe msg
function writeColliderSizeToMessage(collider, // rapier collider
				    aframeMsg) {
  if (!collider) return;
  let sizeOk = true;
  const shape = collider.shape;
  switch (shape?.type) {
  case RAPIER.ShapeType.Cuboid:
    aframeMsg.size = {x: shape.halfExtents.x * 2,
		      y: shape.halfExtents.y * 2,
		      z: shape.halfExtents.z * 2
		     };
    break;
  case RAPIER.ShapeType.Cylinder:
  case RAPIER.ShapeType.Capsule:
    aframeMsg.size = {height: shape.halfHeight * 2,
		      radius: shape.radius
		     };
    break;
  case RAPIER.ShapeType.Ball:
    aframeMsg.size = {radius: shape.radius
		     };
    break;
  default:
    sizeOk = false;
    break;
  }
  if (!sizeOk) {
    console.warn("Unknown collider shape: ", shape);
    console.warn("msg without size:", aframeMsg);
  }
}

// ********************************
// write position&orientation of RB to aframe msg
function writePoseToMessage(body, message) {
  if (!body) return;
  const position = body.translation();
  const orientation = body.rotation();
  message.pose = [position.x, position.y, position.z,
		  orientation.w, orientation.x, orientation.y, orientation.z
		 ];
}

// ********************************
function setColliderProperties(collider, props)
{
  if (props?.density) {
    collider.setDensity(props.density);
  }
  if (props?.mass) {
    collider.setMass(props.mass);
  }
  if (props?.massProperties) {
    // mass
    // centerOfMass (Vector3)
    // principalAngularInertia (Vector3)
    // angularInertiaLocalFrame (Quaternion)
    collider.setMassProperties(...props.massProperties);
  }
  if (props?.friction) {
    collider.setFriction(props.friction);
  }
  if (props?.frictionCombineRule) {
    collider.setFrictionCombineRule(RAPIER.CoefficientCombineRule[props.frictionCombineRule]);
  }
  if (props?.restitution) {
    collider.setRestitution(props.restitution);
  }
  if (props?.restitutionCombineRule) {
    collider.setRestitutionCombineRule(RAPIER.CoefficientCombineRule[props.restitutionCombineRule]);
  }
}

// ********************************
function createPrimitive(world, position, rotation, colliderDef,
			 id, dynamicsType = 'dynamic') {
  // Create a dynamic rigid-body.
  if (!position) {
    position = {x: 0.0, y: 0.0, z: 0.0};
  }
  if (!rotation) {
    rotation = {w: 1.0, x: 0.0, y: 0.0, z: 0.0};
  }
  let rbDesc;
  switch (dynamicsType) {
  case 'dynamic':
    rbDesc = RAPIER.RigidBodyDesc.dynamic()
    break;
  case 'kinematicPosition':
    rbDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
    break;
  case 'kinematicVelocity':
    rbDesc = RAPIER.RigidBodyDesc.kinematicVelocityBased()
    break;
  case 'fixed':
    rbDesc = RAPIER.RigidBodyDesc.fixed()
    break;
  default:
    console.warn("Unknown dynamics type:", dynamicsType,
		 "using dynamic.");
    rbDesc = RAPIER.RigidBodyDesc.dynamic()
  }
  rbDesc
    .setTranslation(position.x, position.y, position.z)
    .setRotation(rotation);
  let rigidBody = world.createRigidBody(rbDesc);
  // Create a cuboid collider attached to the dynamic rigidBody.
  // let boxColliderDesc = RAPIER.ColliderDesc.cuboid(size.x, size.y, size.z);
  const colliderDesc = createColliderDesc(colliderDef);
  setColliderProperties(colliderDesc, colliderDef?.props);
  let rapierCollider = world.createCollider(colliderDesc, rigidBody);
  const aframeMsg = {type: 'definition', id: id, shape: colliderDef.shape,
			color: colliderDef?.color };
  // writeCuboidSizeToMessage(rapierCollider, aframeMsg);
  writeColliderSizeToMessage(rapierCollider, aframeMsg);
  writePoseToMessage(rigidBody, aframeMsg);
  return {rigidBody, rapierCollider, aframeMsg};
}

// ********************************
function primitiveCreateAndPost(id,
				world, position, rotation,
				colliderDef,
				dynamicsType = 'dynamic',
				share = true, bodyList = storedBodies,
				colliderList = storedColliders,
			       ) {
  if (!dynamicsType) dynamicsType = 'dynamic';
  const {rigidBody: rapierRb, rapierCollider, aframeMsg}
	= createPrimitive(world, position, rotation, colliderDef,
			  id,
			  dynamicsType);
  self.postMessage(aframeMsg);
  if (share) {
    bodyList[id] = rapierRb;
    colliderList[id] = rapierCollider;
  }
  return rapierRb;
}

// ********************************
function setNextPose(body, position, rotation) {
  if (!body.isKinematic()) {
    console.warn("setNextPose: body is not kinematic:", body);
    return;
  }
  body.setNextKinematicTranslation(position);
  body.setNextKinematicRotation(rotation);
}
// ********************************
function fix(fixName, body1name, body2name) {
  const body1 = storedBodies[body1name];
  const body2 = storedBodies[body2name];
  if (self?.world &&
      body1 && body2 && !storedJoints[fixName]) {
    const pose1 = [body1.translation(), body1.rotation()];
    const pose2 = [body2.translation(), body2.rotation()];
    const pose2in1 = isoMultiply(isoInvert(pose1), pose2);
    const params = RAPIER.JointData.fixed(pose2in1[0], pose2in1[1],
					  {x:0, y:0, z:0},
					  {w:1, x:0, y:0, z:0});
    const joint = self.world.createImpulseJoint(params, body1, body2, true);
    storedJoints[fixName] = joint;
    return joint;
  } else {
    console.warn("fix: body not found:", body1name, body2name,
		 "or joint already exists:", fixName);
    console.warm('bodyA:', body1, 'bodyB:',body2,
		 'fixJnt(must be undefined):', storedJoints[fixName],
		 'world:', self?.world);
    return null;
  }
}
function release(fixName) {
  const joint = storedJoints[fixName];
  if (self?.world && joint) {
    const jnt = self.world.removeImpulseJoint(joint, true);
    delete storedJoints[fixName];
  } else {
    console.warn("release: joint not found:", fixName);
  }
}
