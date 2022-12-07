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

