
float uToFloat01(uint x) {
  return float(x) / 4294967296.0; // 2^32
}

// From http://jcgt.org/published/0009/03/02/
uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  return v;
}
// cosine weighted hemisphere sampling
// rnd: vec2 of random numbers in [0,1)
// normal: vec3, the hemisphere axis
vec3 hemisphereSample(vec3 normal, int i) {
  uint x = uint(gl_FragCoord.x);
  uint y = uint(gl_FragCoord.y);
  uint z = uint(i);
  uvec3 seed = uvec3(x, y, z);
  uvec3 rndInt = pcg3d(seed);
  vec2 rnd = vec2(uToFloat01(rndInt.x), uToFloat01(rndInt.y));

  float phi = 2.0 * PI * rnd.x;       // azimuth
  float cosTheta = sqrt(1.0 - rnd.y); // polar, cosine-weighted
  float sinTheta = sqrt(1.0 - cosTheta * cosTheta);

  // Cartesian coordinates in tangent space
  vec3 tangent, bitangent;
  if (abs(normal.x) > 0.1)
    tangent = normalize(cross(vec3(0, 1, 0), normal));
  else
    tangent = normalize(cross(vec3(1, 0, 0), normal));
  bitangent = cross(normal, tangent);

  return normalize(tangent * (cos(phi) * sinTheta) +
                   bitangent * (sin(phi) * sinTheta) + normal * cosTheta);
}

float rayTracedAO(vec3 pos, vec3 normal) {
  float ao = 0.0;
  int nSamples = 50;
  vec3 noiseGradient; // needs to be given to noise computation even though we
                      // don't need it here
  float maxDist = 0.25;
  int maxSteps = 70;
  for (int i = 0; i < nSamples; i++) {

    vec3 dir = hemisphereSample(normal, i);
    float t = 0.;
    bool hit = false;
    for (int j = 0; j < maxSteps; j++) {
      vec3 shiftedPos = pos + dir * t;
      float dist = noisySceneSDF(shiftedPos, u_size, noiseGradient);
      if (dist < EPSILON) {
        hit = true;
        break;
      }
      dist *= SCALE_STEP_SIZE;
      dist = max(dist, MIN_STEP_SIZE);
      t += dist;
      if (t > maxDist)
        break;
    }
    ao += hit ? 0. : 1.;
  }
  ao /= float(nSamples);
  return ao;
}
