THREE.GLTFLoader = (function(){
    function GLTFLoader(manager){
        THREE.Loader.call(this, manager);

        this.dracoLoader = null;
        this.ddsLoader = null;
    }

    GLTFLoader.prototype = Object.assign(Object.create(THREE.Loader.prototype),{
        constructor: GLTFLoader,
        load: function(url, onLoad, onProgress, onError){
            var scope = this;
            var resourcePath;
            
            if(this.resourcePath !== ''){
                resourcePath = this.resourcePath;
            }
            else if(this.path !== ''){
                resourcePath = this.path;
            }
            else{
                resourcePath = THREE.LoaderUtils.extractUrlBase(url);
            }
            
            scope.manager.itemStart(url);
            
            var _onError = function(e){
                if(onError){
                    onError(e);
                }
                else{
                    console.error(e);
                }
                scope.manager.itemError(url);
                scope.manager.itemEnd(url);
            };

            var loader = new THREE.FileLoader(scope.manager);

            loader.setPath(this.path);
            loader.setResponseType('arraybuffer');

            if(scope.crossOrigin === 'use-credentials'){
                loader.setWithCredentials(true);

            }
            loader.load(url, function(data){
                try{
                    scope.parse(data, resourcePath, function(gltf){
                        onLoad(gltf);
                        scope.manager.itemEnd(url);
                    }, _onError);
                }catch(e){
                    _onError(e);
                }
            }, onProgress, _onError);
        },
        setDRACOLoader: function(dracoLoader){
            this.dracoLoader = dracoLoader;
            return this;
        },
        setDRACOLoader: function(ddsLoader){
            this.ddsLoader = ddsLoader;
            return this;
        },
        parse: function(data, path, onLoad, onError){
            var content;
            var extensions = {};

            if(typeof data === 'string'){
                content = data;
            }else{
                var magic = THREE.LoaderUtils.decodeText(new Uint8Array(data, 0, 4));

                if(magic === BINARY_EXTENSION_HEADER_MAGIC){
                    try{
                        extensions[EXTENSIONS.KHR_BINARY_GLTF] = new GLTFBinaryExtension(data);
                    }
                    catch(error){
                        if(onError) onError(error);
                        return;
                    }
                    content = extensions[EXTENSIONS.KHR_BINARY_GLTF].content;
                }else{
                    content = THREE.LoaderUtils.decodeText(new Uint8Array(data));
                }
            }

            var json = JSON.parse(content);

            if(json.asset === undefined || json.asset.version[0] < 2){
                if(onError) onError(new Error('THREE>GLTFLoader: Unsupportd asset. glTF versions >= 2.0 are supported.'));
                return;
            }

            if(json.extensionsUsed){
                for(var i = 0; i < json.extensionsUsed.length; i++){
                    var extensionName = json.extensionsUsed[i];
                    var extensionsRequired = json.extensionsRequired || [];

                    switch(extensionName){
                        case EXTENSIONS.KHR_LIGTHS_PUNCTUAL:
                        extensions[extensionName] = new GLTFLigthsExtension(json);
                        break;
                        
                        case EXTENSIONS.KHR_MATERIALS_UNLIT:
                        extensions[extensionName] = new GLTFMaterialsUnlitExtension();
                        break;
                        
                        case EXTENSIONS.KHR_MATERIALS_PBR_SPECULAR_GLOSSINESS:
                        extensions[extensionName] = new GLTFMaterialsPbrSpecularGlossinessExtension();
                        break;
                        
                        case EXTENSIONS.KHR_DRACO_MESH_COMPRESSION:
                        extensions[extensionName] = new GLTFDracoMeshCompressionExtension(json, this.dracoLoader);
                        break;
                        
                        case EXTENSIONS.MSFT_TEXTURE_DDS:
                        extensions[extensionName] = new GLTFTextureDDSExtension(this.ddsLoader);
                        break;
                        
                        case EXTENSIONS.KHR_TEXTURE_TRANSFORM:
                        extensions[extensionName] = new GLTFTextureTransfomExtension();
                        break;
                        
                        case EXTENSIONS.KHR_MESH_QUANTIZATION:
                        extensions[extensionName] = new GLTFMeshQuantizationExtension();
                        break;

                        default:
                            if(extensionsRequired.indexOf(extensionName) >= 0){
                                console.warn('THREE.GLTFLoader: Unknown extension "'+ extensionName +'".');
                            }
                    }
                }
            }
            var parser = new GLTFParse(json, extensions, {
                path: path || this.resourcePath || '',
                crossOrigin: this.crossOrigin,
                manager: this.constructor.manager
            });
            parser.parse(onLoad, onError);
        }
    });

    function GLTFRegistry(){
        var objects = {};

        return {
            get: function(key){
                return objects[key];
            },
            add: function(key, object){
                objects[key] = object;
            },
            remove: function(key){
                delete objects[key];
            },
            removeAll: function(key){
                objects = {};
            }
        };
    }
})

var EXTENSIONS = {
    KHR_BINARY_GLTF: 'KHR_binary_glTF',
    KHR_DRACO_MESH_COMPRESSION: 'KHR_draco_mesh_compression',
    KHR_LIGTHS_PUNCTUAL: 'KHR_ligths_punctual',
    KHR_MATERIALS_PBR_SPECULAR_GLOSSINESS: 'KHR_materials_pbrSpecularGlossines',
    KHR_MATERIALS_UNLIT: 'KHR_materials_unlit',
    KHR_TEXTURE_TRANSFORM: 'KHR_texture_transform',
    KHR_MESH_QUANTIZATION: 'KHR_mesh_quartization',
    MSFT_TEXTURE_DDS: 'MSFT_texture_dds'
};

function GLTFTextureDDSExtension(ddsLoader){
    if(!ddsLoader){
        throw new Error('THREE.GLTFLoader: Attempting to load .dds texture without importing THREE.DDSLoader');
    }
    this.name = EXTENSIONS.MSFT_TEXTURE_DDS;
    this.ddsLoader = ddsLoader;
}

function GLTFLigthsExtension(json){
    this.name = EXTENSIONS.KHR_LIGTHS_PUNCTUAL;

    var extension = (json.extensions && json.extensions[EXTENSIONS.KHR_LIGTHS_PUNCTUAL]) || {};
    this.lightDefs = extension.lights || [];
}

GLTFLigthsExtension.prototype.loadLight = function(lightIndex){
    var lightDef = this.lightDefs[lightIndex];
    var lightNode;
    var color = new THREE.Color(0xffffff);
    
    if(lightDef.type) color.fromArray(lightDef.color);

    var range = lightDef.range !== undefined ? lightDef.range : 0;

    switch (lightDef.type) {
        case 'directional':
            lightNode = new THREE.DirectionalLight(color);
            lightNode.target.position.set(0, 0, -1);
            lightNode.add(lightNode.target);
            break;
        case 'point':
            lightNode = new THREE.PointLight(color);
            lightNode.distance = range;
            break;
        case 'spot':
            lightNode = new THREE.SpotLight(color);
            lightNode.distance = range;

            lightDef.spot = lightDef.spot || {};
            lightDef.spot.innerConeAngle = lightDef.spot.innerConeAngle !== undefined ? lightDef.spot.innerConeAngle : 0;
            lightDef.spot.outerConeAngle = lightDef.spot.outerConeAngle !== undefined ? lightDef.spot.outerConeAngle : Math.PI / 4.0;
            lightNode.angle = lightDef.spot.outerConeAngle;
            lightNode.penumbra = 1.0 - lightDef.spot.innerConeAngle / lightDef.spot.outerConeAngle;
            lightNode.target.position.set(0, 0, -1);
            lightNode.add(lightNode.target);
    
            break;
    
        default:
            throw new Error('THREE.GLTFLoader: Unexpected light type, "' + lightDef.type +'".');
            break;
    }

    lightNode.position.set(0, 0, 0);
    lightNode.decay = 2;

    if(lightDef.intensity !== undefined) lightNode.intensity = lightDef.intensity;

    lightNode.name = lightDef.name || ('light_' + lightIndex);

    return Promise.resolve(lightNode);
};

function GLTFMaterialsUnlitExtension(){
    this.name = EXTENSIONS.KHR_MATERIALS_UNLIT;
};

GLTFMaterialsUnlitExtension.prototype.getMaterialType = function(){
    return THREE.MeshBasicMaterial;
};

GLTFMaterialsUnlitExtension.prototype.extendParams = function(materialParams, materialDef, parser){
    var pending = [];

    materialParams.color = new THREE.Color(1.0, 1.0, 1.0);
    materialParams.opacity = 1.0;

    var metallicRoughness = materialDef.pbrMetallicRoughness;

    if(metallicRoughness){
        if(Array.isArray(metallicRoughness.baseColorFactor)){
            var array = metallicRoughness.baseColorFactor;

            materialParams.color.fromArray(array);
            materialParams.opacity = array[3];
        }

        if(metallicRoughness.baseColorTexture !== undefined){
            pending.push(parser.assignTexture(materialParams, 'map', metallicRoughness.baseColorTexture));
        }
    }

    return Promise.all(pending);
};

var BINARY_EXTENSION_HEADER_MAGIC = 'glTF';
var BINARY_EXTENSION_HEADER_LENGTH = 12;
var BINARY_EXTENSION_CHUNK_TYPES = {JSON: 0x4E4F534A, BIN: 0x004E4942};

function GLTFBinaryExtension(data){
    this.name = EXTENSIONS.KHR_BINARY_GLTF;
    this.content = null;
    this.body = null;

    var headerView = new DataView(data, 0, BINARY_EXTENSION_HEADER_LENGTH);

    this.header = {
        magic: THREE.LoaderUtils.decodeText(new Uint8Array(data.slice(0, 4))),
        version: headerView.getUint32(4, true),
        length: headerView.getUint32(8, true)
    };

    if(this.header.magic !== BINARY_EXTENSION_HEADER_MAGIC){
        throw new Error('THREE.GLTFLoader: Unsupported glTF-Binary header.');
    }else if(this.header < 2.0){
        throw new Error('THREE.GLTFLoader: Legacy binary file detected.');
    }

    var chunkView = new DataView(data, BINARY_EXTENSION_HEADER_LENGTH);
    var chunkIndex = 0;

    while (chunkIndex < chunkView.byteLength) {
        var chunkLenght = chunkView.getUint32(chunkIndex, true);
        chunkIndex += 4;
        
        var chunkType = chunkView.getUint32(chunkIndex, true);
        chunkIndex += 4;

        if(chunkType === BINARY_EXTENSION_CHUNK_TYPES.JSON){
            var contentArray = new Uint8Array(data, BINARY_EXTENSION_HEADER_LENGTH + chunkIndex, chunkLenght);
            this.content = THREE.LoaderUtils.decodeText(contentArray);
        }else if(chunkType == BINARY_EXTENSION_CHUNK_TYPES.BIN){
            var byteOffset = BINARY_EXTENSION_HEADER_LENGTH + chunkIndex;
            this.body = data.slice(byteOffset, byteOffset + chunkLenght);
        }

        chunkIndex += chunkLenght;
    }

    if(this.content === null){
        throw new Error('THREE.GLTFLoader: JSON content not found.');
    }
}

function GLTFDracoMeshCompressionExtension(json, dracoLoader){
    if(!dracoLoader){
        throw new Error('THREE.GLTFLoader: No DRACOLoader instance provided.');
    }

    this.name = EXTENSIONS.KHR_DRACO_MESH_COMPRESSION;
    this.json = json;
    this.dracoLoader = dracoLoader;
    this.dracoLoader.preload();
}

GLTFDracoMeshCompressionExtension.prototype.decodePrimitive = function(primitive, parser){
    var json = this.json;
    var dracoLoader = this.dracoLoader;
    var bufferViewIndex = primitive.extensions[this.name].bufferView;
    var gltfAttributeMap = primitive.extensions[this.name].attributes;
    var threeAttrinuteMap = {};
    var attributeNormalizedMap = {};
    var attributeTypeMap = {};

    for(var attributeName in gltfAttributeMap){
        var threeAttrinuteName = ATTRIBUTES[attributeName] || attributeName.toLowerCase();

        threeAttrinuteMap[threeAttrinuteName] = gltfAttributeMap[attributeName];
    }

    for(attributeName in primitive.attributes){
        var threeAttrinuteName = ATTRIBUTES[attributeName] || attributeName.toLowerCase();

        if(gltfAttributeMap[attributeName] !== undefined){
            var accessorDef = json.accessors[primitive.attributes[attributeName]];
            var componetType = WEBGL_COMPONENT_TYPES[accessorDef.componetType];

            attributeTypeMap[threeAttrinuteName] = componetType;
            attributeNormalizedMap[threeAttrinuteName] = accessorDef.normalized === true;
        }
    }

    return parser.getDependency('bufferView', bufferViewIndex).then(function(bufferView){
        return new Promise(function(resolve){
            dracoLoader.decodeDracoFile(bufferView, function(geometry){
                for(var attributeName in geometry.attributes){
                    var attribute = geometry.attributes[attributeName];
                    var normalized = attributeNormalizedMap[attributeName];

                    if(normalized !== undefined) attribute.normalized = normalized;
                }
                resolve(geometry);
            }, threeAttrinuteMap, attributeTypeMap);
        });
    });
};

function GLTFTextureTransfomExtension() {
    this.name = EXTENSIONS.KHR_TEXTURE_TRANSFORM;
}

GLTFTextureTransfomExtension.prototype.extendTexture = function(texture, transform){
    texture = texture.clone();

    if(transform.offset !== undefined){
        texture.offset.fromArray(transform.offset);
    }

    if(transform.rotation !== undefined){
        texture.rotation = transform.rotation;
    }

    if(transform.scale !== undefined){
        texture.repeat.fromArray(transform.scale);
    }

    if(transform.texCoord !== undefined){
        console.warn('THREE.GLTFLoader: Custom UV sets in "'+ this.name + '" extension not yet supported.');
    }

    texture.needsUpdate = true;
    return texture;
};

function GLTFMaterialsPbrSpecularGlossinessExtension(){
    return{
        name: EXTENSIONS.KHR_MATERIALS_PBR_SPECULAR_GLOSSINESS, specularGlossinessParams:[
            'color',
            'map',
            'lightMap',
            'lightMapIntensity',
            'aoMap',
            'aoMapIntensity',
            'emissive',
            'emissiveIntensity',
            'emissiveMap',
            'bumpMap',
            'bumpScale',
            'normalMap',
            'displacementMap',
            'displacementScale',
            'displacemntBias',
            'specularMap',
            'specular',
            'glossinessMap',
            'glossiness',
            'alphaMap',
            'envMap',
            'envMapIntensity',
            'refractionRatio'
        ],
        getMaterialType: function(){
            return THREE.ShaderMaterial;
        },
        extendParams: function (materialParams, materialDef, parser) {
            var pbrSpecularGlossiness = materialDef.extensions[this.name];
            var shader = THREE.shaderLib['standard'];
            var specularMapParsFragmentChunk = [
                '#ifdef USE_SPECULARMAP',
                'uniform sampler2D specularMap;',
                '#endif'
            ].join('\n');
            var specularMapFragmentChunk = [
                'vec3 specularFactor = specular;',
                '#ifdef USE_SPECULARMAP',
                'vec4 texelSpecular = texture2D(specularMap, vUv);',
                'texelSpecular = sRGBToLinear(texelSpecular);',
                '// reads channel RGB, compatible with a glTF Specular-Glossiness (RGBA) texture',
                'specularFactor *= texelSpecular.rgb;',
                '#endif'
            ].join('\n');
            var glossinessMapFragmentChunk = [
                'float glossinessFactor = glossiness;',
                '#ifdef USE_GLOSSINESSMAP',
                'vec4 texelGlossiness = texture2D(glossinessMap, vUv);',
                '// reads channel A, compatible with a glTF Specular-Glossiness (RGBA) texture',
                'glossinessFactor *= texelGlossiness.a',
                '#endif'
            ].join('\n');
            var lightPhysicalFragmentChunk = [
                'PhysicalMaterial material;',
                'material.diffuseColor = diffuseColor.rgb;',
                'material.specularRoughness = clamp(1.0 - glossinessFactor, 0.04, 1.0);',
                'material.specularColor = specularFactor.rgb;'
            ].join('\n');
            var fragmentShader = shader.fragmentShader.replace(
                'uniform float roughness;',
                'uniform vec3 specular;'
            ).replace(
                'uniform float metalness;',
                'uniform float glossiness;'
            ).replace(
                '#include <roughnessmap_pars_fragment>',
                specularMapParsFragmentChunk
            ).replace(
                '#include <metalnessmap_pars_fragment>',
                glossinessMapFragmentChunk
            ).replace(
                '#include <roughnessmap_fragment>',
                specularMapFragmentChunk
            ).replace(
                '#include <metalnessmap_fragment>',
                glossinessMapFragmentChunk
            ).replace(
                '#include <lights_pysical_fragment>',
                lightPhysicalFragmentChunk
            );

            delete uniforms.roughness;
            delete uniforms.metalness;
            delete uniforms.roughnessMap;
            delete uniforms.metalnessMap;

            uniforms.specular = {value: new THREE.Color().setHex(0x111111)};
            uniforms.glossiness = {value: 0.5};
            uniforms.specularMap = {value: null};
            uniforms.glossinessMap = {value: null};

            materialParams.vertexShader = shader.vertexShader;
            materialParams.fragmentShader = fragmentShader;
            materialParams.uniforms = uniforms;
            materialParams.defines = {'STANDARD': ''};
            materialParams.color = new THREE.Color(1.0, 1.0, 1.0);
            materialParams.opacity = 1.0;

            var pending = [];

            if(Array.isArray(pbrSpecularGlossiness.diffuseFactor)){
                var array = pbrSpecularGlossiness.diffuseFactor;

                materialParams.color.fromArray(array);
                materialParams.opacity = array[3];
            }

            if(pbrSpecularGlossiness.diffuseTexture !== undefined){
                pending.push(parser.assignTexture(materialParams, 'map', pbrSpecularGlossiness.diffuseTexture));
            }

            materialParams.emissive = new THREE.Color(0.0, 0.0, 0.0);
            materialParams.glossiness = pbrSpecularGlossiness.glossinessFactor !== undefined ? pbrSpecularGlossiness.glossinessFactor : 1.0;
            materialParams.specular = new THREE.Color(1.0, 1.0, 1.0);

            if(Array.isArray(pbrSpecularGlossiness.specularFactor)){
                materialParams.specular.fromArray(pbrSpecularGlossiness.specularFactor);
            }

            if(pbrSpecularGlossiness.specularGlossinessTexture !== undefined){
                var specGlossinessMapDef = pbrSpecularGlossiness.specularGlossinessTexture;
                pending.push(parser.assignTexture(materialParams, 'glossinessMap', specGlossinessMapDef));
            }

            return Promise.all(pending);
        },
        createMaterial: function(params){
            var material = new THREE.ShaderMaterial({
                defines: params.defines,
                vertexShader: params.vertexShader,
                fragmentShader: params.fragmentShader,
                uniforms: params.uniforms,
                fog: true,
                lights: true,
                opacity: params.opacity,
                transparent: params.transparent
            });

            material.isGLTFSpecularGlossinessMaterial = true;
            material.color = params.color;
            material.map = params.map === undefined ? null : params.map;
            material.lightMap = null;
            material.lightMapIntensity = 1.0;
            material.aoMap = params.aoMap === undefined ? null : params.aoMap;
            material.aoMapIntensity = 1.0;
            material.emissive = params.emissive;
            material.emissiveIntensity = 1.0;
            material.emissiveMap = params.emissiveMap === undefined ? null : params.emissiveMap;
            material.bumpMap = params.bumpMap === undefined ? null : params.bumpMap;
            material.bumpScale = 1;
            material.normalMap = params.normalMap == undefined ? null : params.normalMap;
            
            if(params.normalScale) material.normalScale = params.normalScale;

            material.displacementMap = null;
            material.displacementScale = 1;
            material.displacementBias = 0;
            material.specularMap = params.specularMap === undefined ? null : params.specularMap;
            material.specular = params.specular;
            material.glossinessMap = params.glossinessMap === undefined ? null : params.glossinessMap;
            material.glossiness = params.glossiness;
            material.alphaMap = null;
            material.envMap = params.envMap === undefined ? null : params.envMap;
            material.envMapIntensity = 1.0;
            material.refractionRatio = 0.98;
            material.extensions.derivatives = true;

            return material;
        },
        cloneMaterial: function(source){
            var target = source.clone();

            target.isGLTFSpecularGlossinessMaterial = true;

            var params = this.specularGlossinessParams;

            for(var i = 0, il = params.length; i < il; i++){
                var value = source[params[i]];

                target[params[i]] = (value && value.isColor) ? value.clone() : value;
            }

            return target;
        },
        refreshUniforms: function (renderer, scene, camara, geometry, material) {
            if(material.isGLTFSpecularGlossinessMaterial !== true){
                return;
            }

            var uniforms = material.uniforms;
            var defines = material.defines;

            uniforms.opacity.value = material.opacity;
            uniforms.diffuse.value.copy(material.color);
            uniforms.emissive.value.copy(material.emissive).multiplyScalar(material.emissiveIntensity);
            uniforms.map.value = material.map;
            uniforms.specularMap.value = material.specularMap;
            uniforms.alphaMap.value = material.alphaMap;
            uniforms.lightMap.value = material.lightMap;
            uniforms.lightMapIntensity.value = material.lightMapIntensity;
            uniforms.aoMap.value = material.aoMap;
            uniforms.aoMapIntensity.value = material.aoMapIntensity;

            var uvScaleMap;

            if(material.map){
                uvScaleMap = material.map;
            }else if(material.specularMap){
                uvScaleMap = material.specularMap;
            }else if(material.displacementMap){
                uvScaleMap = material.displacementMap;
            }else if(material.normalMap){
                uvScaleMap = material.normalMap;
            }else if(material.bumpMap){
                uvScaleMap = material.bumpMap;
            }else if(material.glossinessMap){
                uvScaleMap = material.glossinessMap;
            }else if(material.alphaMap){
                uvScaleMap = material.alphaMap;
            }else if(material.emissiveMap){
                uvScaleMap = material.emissiveMap;
            }

            if(uvScaleMap !== undefined){
                if(uvScaleMap.isWebGLRenderTarget){
                    uvScaleMap = uvScaleMap.texture;
                }

                if(uvScaleMap.matrixAutoUpdate === true){
                    uvScaleMap.updateMatrix();
                }

                uniforms.uvTransform.value.copy(uvScaleMap.matrix);
            }

            if(material.envMap){
                uniforms.envMap.value = material.envMap;
                uniforms.envMapIntensity.value = material.envMapIntensity;
                uniforms.flipEnvMap.Value = material.envMap.isCubeTexture ? -1 : 1;
                uniforms.reflectivity.value = material.reflectivity;
                uniforms.refractionRatio.value = material.refractionRatio;
                uniforms.maxMipLevel.value = renderer.properties.get(material.envMap)._maxMipLevel;
            }

            uniforms.specular.value.copy(material.specular);
            uniforms.glossiness.value = material.glossiness;
            uniforms.glossinessMap.value = material.glossinessMap;
            uniforms.bumpMap.value = material.bumpMap;
            uniforms.normalMap.value = material.normalMap;
            uniforms.displacementMap.value = material.displacementMap;
            uniforms.displacementScale.value = material.displacementScale;
            uniforms.displacementBias.value = material.displacementBias;

            if(uniforms.glossinessMap.value !== null && defines.USE_GLOSSINESSMAP !== undefined){
                delete defines.USE_GLOSSINESSMAP;
                delete defines.USE_ROUGHNESSMAP;
            }
        }
    };
}

function GLTFMeshQuantizationExtension(){
    this.name = EXTENSIONS.KHR_MESH_QUANTIZATION;
}

function GLTFCubicSplineInterpolant(parameterPositions, sampleValues, sampleSize, resultBuffer){
    THREE.Interpolant.call(this, parameterPositions, sampleValues, sampleSize, resultBuffer);
}

GLTFCubicSplineInterpolant.prototype = Object.create(THREE.Interpolant.prototype);
GLTFCubicSplineInterpolant.prototype.constructor = GLTFCubicSplineInterpolant;

GLTFCubicSplineInterpolant.prototype.copySampleValue_ = function(index){
    var result = this.resultBuffer,
        values = this.sampleValues,
        valueSize = this.valueSize,
        offset = index * valueSize * 3 + valueSize;


    for(var i = 0; i !== valueSize; i++){
        result[i] = values[offset + i];
    }

    return result;
};

GLTFCubicSplineInterpolant.prototype.beforeStart_ = GLTFCubicSplineInterpolant.prototype.copySampleValue_;
GLTFCubicSplineInterpolant.prototype.afterEnd_ = GLTFCubicSplineInterpolant.prototype.copySampleValue_;

GLTFCubicSplineInterpolant.prototype.interpolate_ = function(i1, t0, t, t1){
    var result = this.resultBuffer;
    var values = this.sampleValues;
    var stride = this.valueSize;
    var stride2 = stride * 2;
    var stride3 = stride * 3;
    var td = t1 - t0;
    var p = (t - t0) / td;
    var pp = p * p;
    var ppp = pp * p;
    var offset1 = i1 * stride3;
    var object0 = offset1 - stride3;
    var s2 = -2 * ppp + 3 * pp;
    var s3 = ppp - pp;
    var s0 = 1 - s2;
    var s1 = s3 - pp + p;

    for(var i = 0; i !== stride; i++){
        var p0 = values[offset0 + i + stride];
        var m0 = values[offset0 + i + stride2] * td;
        var p1 = values[offset1 + i + stride];
        var m1 = values[offset1 + i] * td;
        result[i] = s0 * p0 + s1 * m0 + s2 * p1 + s3 * m1;
    }

    return result;
};

var WEBGL_CONSTANTS = {
    FLOAT: 5126,
    FLOAT_MAT3: 35675,
    FLOAT_MAT4: 35676,
    FLOAT_VEC2: 35664,
    FLOAT_VEC3: 35665,
    FLOAT_VEC4: 35666,
    LINEAR: 9729,
    REPEAT: 10497,
    SAMPLER_2D: 35678,
    POINTS: 0,
    LINES: 1, 
    LINE_LOOP: 2,
    LINE_STRIP: 3,
    TRIANGLES: 4,
    TRIANGLE_STRIP: 5,
    TRIANGLE_FAN: 6,
    UNSIGNED_BYTE: 5121,
    UNSIGNED_SHORT: 5123
};

var WEBGL_COMPONENT_TYPES = {
    5120: Int8Array,
    5121: Uint8Array,
    5122: Int16Array,
    5123: Uint16Array,
    5125: Uint32Array,
    5126: Float32Array
};

var WEBGL_FILTERS = {
    9728: THREE.NearestFilter,
    9729: THREE.LinearFilter,
    9984: THREE.NearestMipmapNearestFilter,
    9985: THREE.LinearMipmapNearestFilter,
    9986: THREE.NearestMipmapLinearFilter,
    9987: THREE.LinearMipmapLinearFilter
};

var WEBGL_WRAPPINGS = {
    33071: THREE.ClampToEdgeWrapping,
    33648: THREE.MirroredRepeatWrapping,
    10497: THREE.ReapeatWrapping
};

var WEBGL_TYPES_SIZES = {
    'SCALAR': 1,
    'VEC2': 2,
    'VEC3': 3,
    'VEC4': 4,
    'MAT2': 4,
    'MAT3': 9,
    'MAT4': 16
};

var ATTRIBUTES = {
    POSITION: 'position',
    NORMAL: 'normal',
    TANGENT: 'tangent',
    TEXCOORD_0: 'uv',
    TEXCOORD_1: 'uv2',
    COLOR_0: 'color',
    WEIGHTS_0: 'skinWeight',
    JOINTS_0: 'skinIndex'
};

var PATH_PROPERTIES = {
    scale: 'scale',
    translation: 'position',
    rotatio: 'quarternion',
    weights: 'morphTargetInfluences'
};

var INTERPOLATION = {
    CUBICSPLINE: undefined,
    LINEAR: THREE.InterpolanteLinear,
    STEP: THREE.InterpolanteDiscrete
};

var ALPHA_MODES = {
    OPAQUE: 'OPAQUE',
    MASK: 'MASK',
    BLEND: 'BLEND'
};

var MIME_TYPE_FORMATS = {
    'image/png': THREE.RGBAFormat,
    'image/jpeg': THREE.RGBAFormat
};

function resolveURL(url, path){
    if(typeof url !== 'string' || url === '') return '';

    if(/^https?:\/\//i.test(path) && /^\//.test(url)){
        path = path.replace(/(^https?:\/\/[^\/]+).*/i, '$1');
    }

    if(/^(https?:)?\/\//i.test(url)) return url;

    if(/^data:.*,.*$/i.test(url)) return url;
    
    if(/^blob:.*$/i.test(url)) return url;

    return path + url;
}

function createDefautMaterial(cache){
    if(cache['DefaultMaterial'] === undefined){
        cache['DefaultMaterial'] = new THREE.MeshStandardMaterial({
            color: 0xFFFFFF,
            emissive: 0x000000,
            metalness: 1,
            roughness: 1,
            transparent: false,
            depthTest: true,
            side: THREE.FrontSide
        });
    }

    return cache['DefaultMaterial'];
}

function addUnknownExtendionsToUserData(knownExtensions, object, objectDef){
    for(var name in objectDef.extensions){
        if(knownExtensions[name] === undefined){
            object.userData.gltfExtensions = object.userData.gltfExtensions || {};
            object.userData.gltfExtensions[name] = objectDef.extensions[name];
        }
    }
}

function assignExtrasToUserData(object, gltfDef) {
    if(gltfDef.extras !== undefined){
        if(typeof gltfDef.extras === 'object'){
            Object.assign(object.userData, gltfDef.extras);
        }else{
            console.warn('THREE.GLTFLoader: Ignoring primitive type .extras, ' + gltfDef.extras);
        }
    }
}

function addMorphTargets(geometry, targets, parser){
    var hasMorphPosition = false;
    var hasMorphNormal = false;

    for(var i = 0, il = targets.length; i < il; i++){
        var target = targets[i];

        if(target.POSITION !== undefined) hasMorphPosition = true;

        if(target.NORMAL !== undefined) hasMorphNormal = true;

        if(!hasMorphPosition && !hasMorphNormal) return Promise.resolve(geometry);

        var pendingPositionAccessors = [];
        var pendingNormalAccessors = [];

        for(var i = 0, il = targets.length; i < il; i++){
            var target = targets[i];

            if(hasMorphPosition){
                var pendingAccessor = target.POSITION !== undefined ? parser.getDependency('accessor', target.POSITION) : geometry.attributes.position;

                pendingPositionAccessors.push(pendingAccessor);
            }

            if(hasMorphNormal){
                var pendingAccessor = target.NORMAL !== undefined ? parser.getDependency('accessor', target.NORMAL) : geometry.attributes.normal;

                pendingNormalAccessors.push(pendingAccessor);
            }
        }

        return Promise.all([
            Promise.all(pendingPositionAccessors),
            Promise.all(pendingNormalAccessors)
        ]).then(function(accessors){
            var morphPositions = accessors[0];
            var morphNormal = accessors[1];

            if(hasMorphPosition) geometry.morphAttributes.position = morphPositions;

            if(hasMorphNormal) geometry.morphAttributes.normal = morphNormals;

            geometry.morphTargetsRelative = true;

            return geometry;
        });
    }

    function updateMorphTargets(mesh, meshDef) {
        mesh.updateMorphTargets();

        if(meshDef.weights !== undefined){
            for(var i = 0, il = meshDef.weights.length; i < il; i++){
                mesh.morphTargetInfluences[i] = meshDef.weights[i];
            }
        }

        if(meshDef.extras && Array.isArray(meshDef.extras.targetNames)){
            var targetNames = meshDef.extras.targetNames

            if(mesh.morphTargetInfluences.length === targetNames.length){
                mesh.morphTargetDictionary = {};

                for(var i = 0, il = targetNames.length; i < il; i++){
                    mesh.morphTargetDictionary[targetNames[i]] = i;
                }
            }else{
                console.warn('THREE.GLTFLoader: Invalid extras.targatNames length. Ignoring names.');
            }
        }
    }

    function createPrimitiveKey(primitiveDef){
        var dracoExtension = primitiveDef.extensions && primitiveDef.extensions[EXTENSIONS.KHR_DRACO_MESH_COMPRESSION];
        var geometryKey;

        if(dracoExtension){
            geometryKey = 'draco:' + dracoExtension.bufferView + ':' + dracoExtension.indices + ':' + createAttributesKey(dracoExtension.attributes);
        }else{
            geometryKey = primitiveDef.indices + ':' + createAttributesKey(primitiveDef.attributes) + ':' + primitiveDef.mode;
        }

        return geometryKey;
    }

    function createAttributsKey(attributes) {
        var attributesKey = '';
        var keys = Object.keys(attributes).sort();

        for(var i = 0, il = keys.length; i < il; i++){
            attributesKey += keys[i] + ':' + attributes[keys[i]] + ';';
        }

        return attributesKey;
    }

    function GLTFParser(json, extensions, options){
        this.json = json || {};
        this.extensions = extensions || {};
        this.options = options || {};
        this.cache = new GLTFRegistry();
        this.primitiveCache = {};
        this.textureLoader = new THREE.TextureLoader(this.options.manager);
        this.textureLoader.setCrossOrigin(this.options.crossOrigin);
        this.fileLoader = new THREE.FileLoader(this.options.manager);
        this.fileLoader.setResponseType('arraybuffer');

        if(this.options.crossOrigin === 'use-credentials'){
            this.fileLoader.setWithCredentials(true);
        }
    }

    GLTFParser.prototype.parse = function(onLoad, onError){
        var parser = this;
        var json = this.json;
        var extensions = this.extensions;

        this.cache.removeAll();
        this.markDefs();

        Promise.all([
            this.getDependencies('scene'),
            this.getDependencies('animation'),
            this.getDependencies('camera')
        ]).then(function(dependencies){
            var result = {
                scene: dependencies[0][json.scene || 0],
                scenes: dependencies[0],
                animations: dependencies[1],
                cameras: dependencies[2],
                asset: json.asset,
                parser: parser,
                userData: {}
            };

            addUnknownExtendionsToUserData(extensions, result, json);
            assignExtrasToUserData(result, json);
            onLoad(result);
        }).catch(onError);
    };

    GLTFParser.prototype.markDefs = function(){
        var nodeDefs = this.json.nodes || [];
        var skinDefs = this.json.skins || [];
        var meshDefs = this.json.meshes || [];

        var meshReferences = {};
        var meshUses = {};

        for(var skinIndex = 0, skinLength = skinDefs.length; skinIndex < skinLength; skinIndex++){
            var joints = skinDefs[skinIndex].joints;

            for(var i = 0, il = joints.length; i < il; i++){
                nodeDefs[joints[i]].isBone = true;
            }
        }

        for(var nodeIndex = 0, nodeLength = nodeDefs.length; nodeIndex < nodeLength; nodeIndex++){
            var nodeDef = nodeDefs[nodeIndex];

            if(nodeDef.mesh !== undefined){
                if(meshReferences[nodeDef.mesh] === undefined){
                    meshReferences[nodeDef.mesh] = meshUses[nodeDef.mesh] = 0;
                }

                meshReferences[nodeDef.mesh]++;

                if(nodeDef.skin !== undefined){
                    meshDefs[nodeDef.mesh].isSkinnedMesh = true;
                }
            }
        }

        this.json.meshReferences = meshReferences;
        this.json.meshUses = meshUses;
    };
    
    GLTFParse.prototype.getDependency = function(type, index){
        var cacheKey = type + ':' + index;
        var dependency = this.cache.get(cacheKey);

        if(!dependency){
            switch (type) {
                case 'scene':
                    dependency = this.loadScene(index); 
                    break;
                case 'node':
                    dependency = this.loadNode(index); 
                    break;
                case 'mesh':
                    dependency = this.loadMesh(index); 
                    break;
                case 'accessor':
                    dependency = this.loadAccessor(index); 
                    break;
                case 'bufferView':
                    dependency = this.loadBufferView(index); 
                    break;
                case 'buffer':
                    dependency = this.loadBuffer(index); 
                    break;
                case 'material':
                    dependency = this.loadMaterial(index); 
                    break;
                case 'texture':
                    dependency = this.loadTexture(index); 
                    break;
                case 'skin':
                    dependency = this.loadSkin(index); 
                    break;
                case 'animation':
                    dependency = this.loadAnimation(index); 
                    break;
                case 'camera':
                    dependency = this.loadCamera(index); 
                    break;
                case 'light':
                    dependency = this.extensions[EXTENSIONS.KHR_LIGTHS_PUNCTUAL].loadLight(index); 
                    break;
                default:
                    throw new Error('Unknown type: ' + type);
            }

            this.cache.add(cacheKey, dependency);
        }

        return dependency;
    }

    GLTFParser.prototype.getDependencies = function(type){
        var dependencies = this.cache.get(type);

        if(!dependencies){
            var parser = this;
            var defs = this.json[type + (type === 'mesh' ? 'es' : 's')] || [];
            
            dependencies = Promise.all(defs.map(function(def, index){
                return parser.getDependency(type, index);
            }));

            this.cache.add(type, dependencies);
        };

        GLTFParser.prototype.loadBuffer = function(bufferIndex){
            var bufferDef = this.json.buffers[bufferIndex];
            var loader = this.fileLoader;

            if(bufferDef.type && bufferDef.type !== 'arraybuffer'){
                throw new Error('THREE.GLTFLoader: ' + bufferDef.type + ' buffer type is not supportd.');
            }

            if(bufferDef.uri === undefined && bufferIndex === 0){
                return Promise.resolve(this.extensions[EXTENSIONS.KHR_BINARY_GLTF].body);
            }

            var options = this.options;

            return new Promise(function(resolve, reject){
                loader.load(resolveURL(bufferDef.uri, options.path), resolve, undefined, function(){
                    reject(new Error('THREE.GLTFLoader: Failed to load buffer "' + bufferDef.uri + '".'));
                });
            });
        };

        GLTFParser.prototype.loadBufferView = function(bufferViewIndex){
            var bufferViewDef = this.json.bufferViews[bufferViewIndex];

            return this.getDependency('buffer', bufferViewDef.buffer).then(function(buffer){
                var byteLength = bufferViewDef.byteLength || 0;
                var byteOffset = bufferViewDef.byteOffset || 0;

                return buffer.slice(byteOffset, byteOffset + byteLength);
            });
        };

        GLTFParser.prototype.loadAccessor =  function(accessorIndex){
            var parser = this;
            var json = this.json;
            var accessorDef = this.json.accessors[accessorIndex];

            if(accessorDef.bufferView === undefined && accessorDef.sparse === undefined){
                return Promise.resolve(null);
            }

            var pendingBufferViews = [];

            if(accessorDef.bufferView !== undefined){
                pendingBufferViews.push(this.getDependency('bufferView', accessorDef.bufferView));
            }else{
                pendingBufferViews.push(null);
            }

            if(accessorDef.sparse !== undefined){
                pendingBufferViews.push(this.getDependency('bufferView', accessorDef.sparse.indices.bufferView));
                pendingBufferViews.push(this.getDependency('bufferView', accessorDef.sparse.values.bufferView));                
            }

            return Promise.all(pendingBufferViews).then(function(bufferViews){
                var bufferView = bufferViews[0];
                var itemSize = WEBGL_TYPES_SIZES[accessorDef.type];
                var typeArray = WEBGL_COMPONENT_TYPES[accessorDef.componetType];
                var elementBytes = TypedArray.BYTES_PER_ELEMENT;
                var itemBytes = elementBytes * itemSize;
                var byteOffset = accessorDef.byteOffset || 0;
                var byteStride = accessorDef.bufferView !== undefined ? json.bufferViews[accessorDef.bufferDef.bufferView].byteStride : undefined;
                var normalized = accessorDef.normalized === true;
                var array, bufferAttribute;

                if(byteStride && byteStride !== itemBytes){
                    var ibSlice = Math.floor(byteOffset / byteStride);
                    var ibCacheKey = 'InterleavedBuffer:' + accessorDef.bufferView + ':' + accessorDef.componetType + ':' + ibSlice + ':' + accessorDef.count;
                    var ib = parser.cache.get(ibCacheKey);

                    if(!ib){
                        array = new TypedArray(bufferView, ibSlice * byteStride, accessorDef.count * byteStride / elementBytes);
                        ib = new THREE.InterleavedBuffer(array, byteStride / elementBytes);

                        parser.cache.add(ibCacheKey, ib);
                    }

                    bufferAttribute = new THREE.InterleavedBufferAttribute(ib, itemSize, (byteOffset % byteStride) / elementBytes, normalized);
                }else{
                    if(bufferView === null){
                        array = new TypedArray(accessorDef.count * itemSize);
                    }else{
                        array = new TypedArray(bufferView, byteOffset, accessorDef.count * itemSize);
                    }

                    bufferAttribute = new THREE.bufferAttribute(array, itemSize, normalized);
                }

                if(accessorDef.sparse !== undefined){
                    var itemSizeIndices = WEBGL_TYPES_SIZES.SCALAR;
                    var TypedArrayIndices = WEBGL_COMPONENT_TYPES[accessorDef.sparse.indices.componetType];
                    var byteOffsetIndices = accessorDef.sparse.indices.byteOffset || 0;
                    var byteOffsetValues = accessorDef.sparse.values.byteOffset || 0;
                    var sparseIndices = new TypedArrayIndices(bufferViews[1], byteOffsetIndices, accessorDef.sparse.count * itemSizeIndices);
                    var sparseValues = new TypedArray(bufferViews[2], byteOffsetValues, accessorDef.sparse.count * itemSize);

                    if(bufferView !== null){
                        bufferAttribute = new THREE.bufferAttribute(bufferAttribute.array.slice(), bufferAttribute.itemSize, bufferAttribute.normalized);
                    }

                    for(var i = 0, il = sparseIndices.length; i < il; i++){
                        var index = sparseIndices[i];

                        bufferAttribute.setX(index, sparseIndices[i * itemSize]);

                        if(itemSize >= 2) bufferAttribute.setY(index, sparseValues[i * itemSize + 1]);
                        if(itemSize >= 3) bufferAttribute.setZ(index, sparseValues[i * itemSize + 2]);
                        if(itemSize >= 4) bufferAttribute.setW(index, sparseValues[i * itemSize + 3]);
                        if(itemSize >= 5) throw new Error('THREE.GLTFLoader: unsupported itemSize in sparse BufferAttribute.');
                    }
                }

                return bufferAttribute;
            });
        };

        GLTFParser.prototype.loadTexture = function(textureIndex){
            var parse = this;
            var json = this.json;
            var options = this.options;
            var textureLoader = this.textureLoader;
            var URL = window.URL || window.webkitURL;
            var textureDef = json.textures[textureIndex];
            var textureExtensions = textureDef.extensions || {};
            var source;

            if(textureExtensions[EXTENSIONS.MSFT_TEXTURE_DDS]){
                source = json.images[textureExtensions[EXTENSIONS.MSFT_TEXTURE_DDS].source];
            }else{
                source = json.images[textureDef.source];
            }

            var sourceURI = source.uri;
            var isObjectURL = false;

            if(source.bufferView !== undefined){
                sourceURI = parser.getDependency('bufferView', source.bufferView).then(function(bufferView){
                    isObjectURL = true;
                    var blob = new Blob([bufferView], {type: source.mimeType});
                    sourceURI = URL.createObjectURL(blob);
                    return sourceURI;
                });
            }

            return Promise.resolve(sourceURI).then(function(sourceURI){
                var loader = options.manager.getHandler(sourceURI);

                if(!loader){
                    loader = textureExtensions[EXTENSIONS.MSFT_TEXTURE_DDS] ? parser.extensions[EXTENSIONS.MSFT_TEXTURE_DDS].ddsLoader : textureLoader;
                }
                
                return new Promise(function(resolve, reject){
                    loader.load(resolveURL(sourceURI, options.path), resolve, undefined, reject);
                });
            }).then(function(texture){
                if(isObjectURL === true){
                    URL.revokeObjectURL(sourceURI);
                }

                texture.flipY = false;

                if(textureDef.name !== undefined) texture.name == textureDef.name;

                if(source.mimeType in MIME_TYPE_FORMATS){
                    texture.format = MIME_TYPE_FORMATS[source.mimeType];
                }

                var samplers = json.samplers || {};
                var sampler = samplers[textureDef.sampler] || {};

                texture.magFilter = WEBGL_FILTERS[sampler.magFilter] || THREE.LinearFilter;
                texture.minFilter = WEBGL_FILTERS[sampler.minFilter] || THREE.LinearMipmapLinearFilter;
                texture.wrapS = WEBGL_WRAPPINGS[sampler.wrapS] || THREE.ReapeatWrapping;
                texture.wrapT = WEBGL_WRAPPINGS[sampler.wrapT] || THREE.ReapeatWrapping;

                return texture;
            });
        };

        GLTFParser.prototype.assignTexture = function(materialParams, mapName, mapDef){
            var perser = this;

            return this.getDependency('texture', mapDef.index).then(function(texture){
                if(!texture.isCompressedTexture){
                    switch (mapName) {
                        case 'aoMap':
                        case 'emissiveMap':
                        case 'metalnessMap':
                        case 'normalMap':
                        case 'roughnessMap':
                            texture.format = THREE.RGBFormat;
                            break;
                    }
                }

                if(mapDef.textCoord !== undefined && mapDef.textCoord != 0 && !(mapName === 'aoMap' && mapDef.textCoord == 1)){
                    console.warn('THREE.GLTFLoader: Custom UV set ' + mapDef.textCoord + ' for textCoord ' + mapName + ' not yet supported.');
                }

                if(parser.extensions[EXTENSIONS.KHR_TEXTURE_TRANSFORM]){
                    var transform = mapDef.extensions !== undefined ? mapDef.extensions[EXTENSIONS.KHR_TEXTURE_TRANSFORM] : undefined;

                    if(transform){
                        texture = parser.extensions[EXTENSIONS.KHR_TEXTURE_TRANSFORM].extendTexture(texture, transform);
                    }
                }

                materialParams[mapName] = texture;
            });
        };

        GLTFParser.prototype.assignFinalMaterial = function(mesh){
            var geometry = mesh.geometry;
            var material = mesh.material;
            var extensions = this.extensions;
            var useVertexTangents = geometry.attributes.target !== undefined;
            var useVertexColors = geometry.attributes.color !== undefined;
            var useFlatShading = geometry.attributes.normal === undefined;
            var useSkinning = mesh.isSkinnedMesh == true;
            var useMorphTargets = Object.keys(geometry.morphAttributes).length > 0;
            var useMorphNormals = useMorphTargets && geometry.morphAttributes.normal !== undefined;

            if(mesh.position){
                var cacheKey = 'PointsMaterial:' + material.uuid;
                var PointsMaterial = this.cache.get(cacheKey);

                if(!PointsMaterial){
                    PointsMaterial = new THREE.PointsMaterial();
                    THREE.Material.prototype.copy.call(PointsMaterial, material);
                    PointsMaterial.color.copy(material.color);
                    PointsMaterial.map = material.map;
                    PointsMaterial.sizeAttenuation = false;

                    this.cache.add(cacheKey, PointsMaterial);
                }

                material = PointsMaterial;
            }else if(mesh.isLine){
                var cacheKey = 'LineBasicMaterial:' + material.uuid;
                var lineMaterial = this.cache.get(cacheKey);

                if(!lineMaterial){
                    lineMaterial = new THREE.LineBasicMaretial();
                    THREE.Material.prototype.copy.call(lineMaterial, material);
                    lineMaterial.color.copy(material.color);

                    this.cache.add(cacheKey, lineMaterial);
                }

                material = lineMaterial;
            }

            if(useVertexTangents || useVertexColors || useFlatShading || useSkinning || useMorphTargets){
                var cacheKey = 'ClonedMaterial:' + material.uuid + ':';

                if(material.isGLTFSpecularGlossinessMaterial) cacheKey += 'specular-glossiness:';
                if(useSkinning) cacheKey += 'skinning';
                if(useVertexTangents) cacheKey += 'vertex-tangents:';
                if(useVertexColors) cacheKey += 'vertex-colors';
                if(useFlatShading) cacheKey += 'flat-shading:';
                if(useMorphTargets) cacheKey += 'morph-targets:';
                if(useMorphNormals) cacheKey += 'morph-normals';

                var cachedMaterial = this.cache.get(cacheKey);

                if(!cachedMaterial){
                    cachedMaterial = material.isGLTFSpecularGlossinessMaterial ? extensions[EXTENSIONS.KHR_MATERIALS_PBR_SPECULAR_GLOSSINESS].cloneMaterial(material) : material.clone();

                    if(useSkinning) cachedMaterial.skinning = true;
                    if(useVertexTangents) cachedMaterial.vertexTangents = true;
                    if(useVertexColors) cachedMaterial.vertexColors = THREE.vertexColors;
                    if(useFlatShading) cachedMaterial.flatShading = true;
                    if(useMorphTargets) cachedMaterial.morphTargets = true;
                    if(useMorphNormals) cachedMaterial.morphNormals = true;

                    this.cache.add(cacheKey, cachedMaterial);
                }

                material = cachedMaterial;
            }

            if(material.aoMap && geometry.attributes.uv2 === undefined && geometry.attributes.uv !== undefined){
                geometry.setAttribute('uv2', new THREE.BufferAttribute(geometry.attributes.uv.array, 2));
            }

            mesh.onBeforeRender = extensions[EXTENSIONS.KHR_MATERIALS_PBR_SPECULAR_GLOSSINESS].refreshUniforms;
        }

        if(material.normalScale && !useVertexTangents){
            material.normalScale.y =- material.normalScale.y;
        }

        mesh.material = material;
    };

    GLTFParse.prototype.loadMaterial = function (materialIndex){
        var parser = this;
        var json = this.json;
        var extensions = this.extensions;
        var materialDef = json.materials[materialIndex];
        var materialType;
        var materialParams = {};
        var materialExtensions = materialDef.extensions || {};
        var pending = [];

        if(materialExtensions[EXTENSIONS.KHR_MATERIALS_PBR_SPECULAR_GLOSSINESS]){
            var sgExtension = extensions[EXTENSIONS.KHR_MATERIALS_PBR_SPECULAR_GLOSSINESS];
            materialType = sgExtension.getMaterialType();
            pending.push(sgExtension.extendParams(materialParams, materialDef, parser));
        }else if(materialExtensions[EXTENSIONS.KHR_MATERIALS_UNLIT]){
            var kmuExtension = extensions[EXTENSIONS.KHR_MATERIALS_UNLIT];
            materialType = kmuExtension.getMaterialType();
            pending.push(kmuExtension.extendParams(materialParams, materialDef, parser));
        }else{
            materialType = THREE.MeshStandardMaterial;

            var metallicRoughness = materialDef.pbrMetallicRoughness || {};

            materialParams.color = new THREE.Color(1.0, 1.0, 1.0);
            materialParams.opacity = 1.0;

            if(Array.isArray(metallicRoughness.baseColorFactor)){
                var array = metallicRoughness.baseColorFactor;
                
                materialParams.color.fromArray(array);
                materialParams.opacity = array[3];
            }

            if(metallicRoughness.baseColorTexture !== undefined){
                pending.push(parser.assignTexture(materialParams, 'map', metallicRoughness.baseColorTexture));
            }

            materialParams.metalness = metallicRoughness.metallicFactor !== undefined ? metallicRoughness.metallicFactor : 1.0;
            materialParams.roughness = metallicRoughness.roughnessFactor !== undefined ? metallicRoughness.roughnessFactor : 1.0;

            if(metallicRoughness.metallicRoughnessTexture !== undefined){
                pending.push(parser.assignTexture(materialParams, 'metalnessMap', metallicRoughness.metallicRoughnessTexture));
                pending.push(parser.assignTexture(materialParams, 'roughnessMap', metallicRoughness.metallicRoughnessTexture));
            }
        }

        if(materialDef.doubleSided === true){
            materialParams.side = THREE.DoubleSide;
        }

        var alphaMode = materialDef.alphaMode || ALPHA_MODES.OPAQUE;

        if(alphaMode === ALPHA_MODES.BLEND){
            materialParams.transparent = true;
        }else{
            materialParams.transparent = false;

            if(alphaMode === ALPHA_MODES.MASK){
                materialParams.alphaTest = materialDef.alphaCutoff !== undefined ? materialDef.alphaCutoff : 0.5;
            }
        }

        if(materialDef.normalTexture !== undefined && materialType !== THREE.MeshBasicMaterial){
            pending.push(parser.assignTexture(materialParams, 'normalMap', materialDef.normalTexture));
            materialParams.normalScale = new THREE.Vector2(1, 1);

            if(materialDef.normalTexture.scale !== undefined){
                materialParams.normalScale.set(materialDef.normalTexture.scale, materialDef.normalTexture.scale);
            }
        }

        if(materialDef.occlusionTeture !== undefined &&materialType !==THREE.MeshBasicMaterial){
            pending.push(parser.assignTexture(materialParams, 'aoMap', materialDef.occlusionTeture));

            if(materialDef.occlusionTeture.strength !== undefined){
                materialParams.aoMapIntensity = materialDef.occlusionTeture.strength;
            }
        }

        if(materialDef.emissiveFactor !== undefined && materialType !== THREE.MeshBasicMaterial){
            materialParams.emissive = new THREE.Color().fromArray(materialDef.emissiveFactor);
        }

        if(materialDef.emissiveTexture !== undefined && materialType !== THREE.MeshBasicMaterial){
            pending.push(parser.assignTexture(materialParams, 'emissiveMap', materialDef.emissiveTexture));
        }

        return Promise.all(pending).then(function(){
            var material;

            if(materialType === THREE.ShaderMaterial){
                material = extensions[EXTENSIONS.KHR_MATERIALS_PBR_SPECULAR_GLOSSINESS].createMaterial(materialParams);
            }else{
                material = new materialType(materialParams);
            }

            if(materialDef.name !== undefined) material.name = materialDef.name;
            if(material.map) material.map.encoding = THREE.sRGBEncoding;
            if(material.emissiveMap) material.emissiveMap.encoding = THREE.sRGBEncoding;
            if(material.specularMap) material.specularMap.encoding = THREE.sRGBEncoding;

            assignExtrasToUserData(material, materialDef);

            if(materialDef.extensions) addUnknownExtendionsToUserData(extensions, material, materialDef);

            return material;
        });
    };

    function computeBounds(geometry, primitiveDef, parser) {
        var attributes = primitiveDef.attributes;
        var box = new THREE.Box3();

        if(attributes.POSITION !== undefined){
            var accessor = parser.json.accessors[attributes.POSITION];
            var min = accessor.min;
            var max = accessor.max;

            if(min !== undefined && max !== undefined){
                box.set(
                    new THREE.Vector3(min[0], min[1], min[2]),
                    new THREE.Vector3(max[0], max[1], max[2])
                );
            }else{
                console.warn('THREE.GLTFLoader: Missing min/max properties for accessor POSITION.');

                return;
            }
        }else{
            return;
        }

        var targets = primitiveDef.targets;

        if(targets !== undefined){
            var vector = new THREE.Vector3();

            for(var i = 0, il = targets.length; i < il; i++){
                var tangent = targets[i];

                if(target.POSITION !== undefined){
                    var accessor = parser.json.accessors[target.POSITION];
                    var min = accessor.min;
                    var max = accessor.max;

                    if(min !== undefined && max !== undefined){
                        vector.setX(Math.max(Math.abs(min[0]), Math.abs(max[0])));
                        vector.setY(Math.max(Math.abs(min[1]), Math.abs(max[1])));
                        vector.setZ(Math.max(Math.abs(min[2]), Math.abs(max[2])));

                        box.extendByVector(vector);
                    }else{
                        console.warn('THREE.GLTFLoader: Missing min/max properties for accessor POSITION.');
                    }
                }
            }
        }

        geometry.boudingBox = box;

        var sphere = new THREE.Sphere();

        box.getCenter(sphere.center);
        sphere.radius = box.min.distanceTo(box.max) / 2;
        geometry.boundingSphere = sphere;
    }

    function addPrimiticeAttributes(geometry, primitiveDef, parser) {
        
        var attributes = primitiveDef.attributes;
        var pending = [];

        function assignAttributeAccessor(accessorIndex, attributeName) {
            return parser.getDependency('accessor', accessorIndex).then(function(accessor){
                geometry.setAttribute(attributeName, accessor);
            });
        }

        for(var gltfAttributeName in attributes){
            var threeAttrinuteName = ATTRIBUTES[gltfAttributeName] || gltfAttributeName.toLowerCase();

            if(threeAttrinuteName in geometry.attributes) continue;

            pending.push(assignAttributeAccessor(attributes[gltfAttributeName], threeAttrinuteName));
        }

        if(primitiveDef.indices !== undefined && !geometry.index){
            var accessor = parser.getDependency('accessor', primitiveDef.indices).then(function (accessor) {
                geometry.push(accessor);
            });
            pending.push(accessor);
        }

        assignExtrasToUserData(geometry, primitiveDef);
        computeBounds(geometry, primitiveDef, parser);

        return Promise.all(pending).then(function () {
            return primitiveDef.targets !== undefined ? addMorphTargets(geometry, primitiveDef.targets, parser) : geometry;
        });
    }

    function toTrianglesDrawMode(geometry, drawMode) {
        var index = geometry.getIndex();

        if(index === null){
            var indices = [];
            var position = geometry.getAttribute('position');

            if(position !== undefined){
                for(var i = 0; i < position.count; i++){
                    indices.push(i);
                }

                geometry.setIndex(indices);
                index = geometry.getIndex();
            }else{
                console.warn('THREE.GLTFLoader.toTrianglesDrawMode(): Undefined position attribute. Processing not possible.');

                return geometry;
            }
        }

        var numberOfTriangles = index.count - 2;
        var newIndices = [];

        if(drawMode === THREE.TrianglesFanDrawMode){
            for(var i = 1; i <= numberOfTriangles; i++){
                newIndices.push(index.getX(0));
                newIndices.push(index.getX(i));
                newIndices.push(index.getX(i + 1));
            }
        }else{
            for(var i = 0; i < numberOfTriangles; i++){
                if(i % 2 === 0){
                    newIndices.push(index.getX(0));
                    newIndices.push(index.getX(i));
                    newIndices.push(index.getX(i + 1));
                }else{
                    newIndices.push(index.getX(i + 2));
                    newIndices.push(index.getX(i + 1));
                    newIndices.push(index.getX(i));
                }
            }
        }

        if((newIndices.length / 3) !== numberOfTriangles){
            console.warn('THREE.GLTFLoader.toTrianglesDrawMode(): Unable to generate correct amount of triangles.');
        }

        var newGeometry = geometry.clone();
        newGeometry.setIndex(newIndices);

        return newGeometry;
    }

    //ta acabando line 2531

}