import RAPIER from '@dimforge/rapier3d-compat'

// *****************
// isometry multiplication function isoMultiply(a, b) 
// a = [p, q] where p: RAPIER.Vector3, q: RAPIER.Rotation
export function isoMultiply(a, b) {
  const p = a[0];
  const q = a[1];
  const r = b[0];
  const s = b[1];
  const pTmp = rotateVector(q,r);
  return [addVector(pTmp,p),
	  multiplyRotation(q,s)];
}
export function isoInvert(a) {
  const p = a[0];
  const q = a[1];
  const q2 = conjugateRotation(q);
  const p2 = {x: -p.x, y: -p.y, z: -p.z};
  return [rotateVector(q2,p2), q2];
}

/**
 * Rotation (Quaternion) utility functions for Rapier.js
 * Rotation オブジェクト: { w, x, y, z }
 * Vector オブジェクト:   { x, y, z }
 */

/** 正規化 */
export function normalizeRotation(q) {
  const len = Math.hypot(q.w, q.x, q.y, q.z);
  if (len === 0) return {w:1, x:0, y:0, z:0};//
  return {w:q.w / len, x:q.x / len, y:q.y / len, z:q.z / len};//
}

/** 共役（逆回転） */
export function conjugateRotation(q) {
  return { w: q.w, x: -q.x, y: -q.y, z: -q.z };
}

/** Rotation同士の掛け算（q1 * q2） */
export function multiplyRotation(q1, q2) {
  return {w: q1.w * q2.w - q1.x * q2.x - q1.y * q2.y - q1.z * q2.z,
	  x: q1.w * q2.x + q1.x * q2.w + q1.y * q2.z - q1.z * q2.y,
	  y: q1.w * q2.y - q1.x * q2.z + q1.y * q2.w + q1.z * q2.x,
	  z: q1.w * q2.z + q1.x * q2.y - q1.y * q2.x + q1.z * q2.w};
}

/** ベクトルを回転させる（q * v * q⁻¹） */
export function rotateVector(q, v) {
  // qを正規化してから使用
  const nq = normalizeRotation(q);
  const qv = { w: 0, x: v.x, y: v.y, z: v.z };
  const qConj = conjugateRotation(nq);
  const tmp = multiplyRotation(nq, qv);
  const res = multiplyRotation(tmp, qConj);
  return {x: res.x, y: res.y, z: res.z};
}

export function addVector(v1, v2) {
  return {x: v1.x+v2.x, y: v1.y+v2.y, z: v1.z+v2.z};
}
