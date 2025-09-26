import RAPIER from '@dimforge/rapier3d-compat'
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

  // // Create the ground
  // let groundColliderDesc = RAPIER.ColliderDesc.cuboid(10.5, 0.1, 10.5);
  // const groundCollider = world.createCollider(groundColliderDesc);
  // const groundPlaneMsg = {type: 'definition', id: 'plane1', shape: 'cuboid',
  // 			  color: "#7BC8A4"};
  // writeCuboidSizeToMessage(groundCollider, groundPlaneMsg);
  // writePoseToMessage(groundCollider, groundPlaneMsg);
  // self.postMessage(groundPlaneMsg);
  
  userConfig.rigidBodies
    .filter(obj=>{return obj?.collider?.shape === 'box';})
    .forEach(obj=>{
      boxCreateAndPost(obj.name, world,
		       obj.position, obj.orientation,
		       obj.collider.size,
		       obj.collider.color,
		       obj?.collider.props,
		       obj?.type);
    });
  userConfig.joints
    .filter(jnt=>{return jnt?.type === 'prismatic';})
    ?.forEach(jnt=>{
      const jntParams = RAPIER.JointData.prismatic(jnt.anchorA,
						   jnt.anchorB,
						   jnt.axis);
      if (jnt?.limits) {
	jntParams.limitsEnabled = true;
	jntParams.limits = jnt.limits;
      } else {
	jntParams.limitsEnabled = false;
      }
      const jj1 = world.createImpulseJoint(jntParams,
					   getRigidBody(jnt.bodyA),
					   getRigidBody(jnt.bodyB),
					   true);
      if (jnt?.motor) {
	const m = jnt.motor;
	if (m?.type === 'position') {
	  jj1.configureMotorPosition(m.targetPos, m.stiffness, m.damping);
	} else if (m?.type === 'velocity') {
	  jj1.configureMotorVelocity(m.targetVel, m.factor);
	}
      }
      storedJoints[jnt.name] = jj1;
    });
  userConfig.joints
    .filter(jnt=>{return jnt?.type === 'revolute';})
    ?.forEach(jnt=>{
      const jntParams = RAPIER.JointData.revolute(jnt.anchorA,
						  jnt.anchorB,
						  jnt.axis);
      if (jnt?.limits) {
	jntParams.limitsEnabled = true;
	jntParams.limits = jnt.limits;
      } else {
	jntParams.limitsEnabled = false;
      }
      const jj1 = world.createImpulseJoint(jntParams,
					   getRigidBody(jnt.bodyA),
					   getRigidBody(jnt.bodyB),
					   true);
      storedJoints[jnt.name] = jj1;
    });

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
      setFuncStateAndArgs(data.name, FunctionState.SINGLE_SHOT, data.args);
      break;
    case 'activate':
      setFuncStateAndArgs(data.name, FunctionState.ACTIVE, data.args);
      break;
    case 'deactivate':
      setFuncStateAndArgs(data.name, FunctionState.STOPPED, data.args);
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
      
  console.log('rigidBodies in the worker:', storedBodies);
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



function writePoseToMessage(body, message) {
  if (!body) return;
  const position = body.translation();
  const orientation = body.rotation();
  message.pose = [position.x, position.y, position.z,
		  orientation.w, orientation.x, orientation.y, orientation.z
		 ];
}
function writeCuboidSizeToMessage(collider, message) {
  if (!collider) return;
  const shape = collider.shape;
  if (shape && shape.type === RAPIER.ShapeType.Cuboid) {
    message.size = {x: shape.halfExtents.x * 2,
		    y: shape.halfExtents.y * 2,
		    z: shape.halfExtents.z * 2
		   };
    // console.log("msg with Cuboid size:", message);
  } else {
    console.warn("Collider shape is not Cuboid:", shape);
    console.warn("msg without size:", message);
  }
}

function boxCreateAndPost(id,
			  world, position, rotation, size, color,
			  colliderProps = {},
			  dynamicsType = 'dynamic',
			  share = true, bodyList = storedBodies,
			  coliderList = storedColliders,
			 ) {
  if (!dynamicsType) dynamicsType = 'dynamic';
  const {box, boxCollider, boxmsg}
	= createBox(world, position, rotation, size, color,
		    id, dynamicsType, colliderProps);
  self.postMessage(boxmsg);
  if (share) {
    bodyList[id] = box;
    coliderList[id] = boxCollider;
  }
  return box;
}

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

function createBox(world, position, rotation, size, color, id,
		   dynamicsType, colliderProps) {
  // Create a dynamic rigid-body.
  if (!position) {
    position = {x: 0.0, y: 0.0, z: 0.0};
  }
  if (!rotation) {
    rotation = {w: 1.0, x: 0.0, y: 0.0, z: 0.0};
  }
  let boxDesc;
  switch (dynamicsType) {
  case 'dynamic':
    boxDesc = RAPIER.RigidBodyDesc.dynamic()
    break;
  case 'kinematicPosition':
    boxDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
    break;
  case 'kinematicVelocity':
    boxDesc = RAPIER.RigidBodyDesc.kinematicVelocityBased()
    break;
  case 'fixed':
    boxDesc = RAPIER.RigidBodyDesc.fixed()
    break;
  default:
    console.warn("Unknown dynamics type:", dynamicsType,
		 "using dynamic.");
    boxDesc = RAPIER.RigidBodyDesc.dynamic()
  }
  boxDesc
    .setTranslation(position.x, position.y, position.z)
    .setRotation(rotation);
  let box = world.createRigidBody(boxDesc);
  // Create a cuboid collider attached to the dynamic rigidBody.
  let boxColliderDesc = RAPIER.ColliderDesc.cuboid(size.x, size.y, size.z);
  setColliderProperties(boxColliderDesc, colliderProps);
  let boxCollider = world.createCollider(boxColliderDesc, box);
  const boxmsg = {type: 'definition', id: id, shape: 'cuboid',
		   color: color };
  writeCuboidSizeToMessage(boxCollider, boxmsg);
  writePoseToMessage(box, boxmsg);
  return {box, boxCollider, boxmsg};
}

function setNextPose(body, position, rotation) {
  if (!body.isKinematic()) {
    console.warn("setNextPose: body is not kinematic:", body);
    return;
  }
  body.setNextKinematicTranslation(position);
  body.setNextKinematicRotation(rotation);
}
