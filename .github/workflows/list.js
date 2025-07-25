const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');
const pathToFfmpeg = require('ffmpeg-static')
const ffmpeg = require('fluent-ffmpeg');
// 获取使用的key
// https://github.com/xlzy520/picgo-plugin-bilibili?tab=readme-ov-file#%E8%8E%B7%E5%8F%96b%E7%AB%99sessdata

ffmpeg.setFfmpegPath(pathToFfmpeg);

let path = '../../'

let list = {}// 不同文件夹的list文件数据

let req = [];// 要发送的http请求

function getListData(dir) {
    if (list[dir]) return list[dir];
    if (!fs.existsSync(`${path}list/${dir}.list`)) {
        return list[dir] = [];
    }
    list[dir] = fs.readFileSync(`${path}list/${dir}.list`, { encoding: 'utf-8' }).toString().split('\n')
    for (var i = list[dir].length - 1; i >= 0; i--) {
        if (list[dir][i] == '')
            list[dir].splice(i, 1);
    }

    return list[dir];

}

function getDir(filename) {
    return filename.substring(0, filename.lastIndexOf('/'));
}

// 参考项目 https://github.com/xlzy520/picgo-plugin-bilibili/blob/master/src/index.js
function uploadToBili(filepath) {

    const form = new FormData();
    form.append('file', fs.createReadStream(filepath));//图片文件的key
    // form.append('biz', 'new_dyn');
    // form.append('category', 'daily');
    form.append('csrf', process.env.CSRF.toString());
    form.append('bucket','openplatform');
    return axios.request({
        method: 'POST',
        url: 'https://api.bilibili.com/x/upload/web/image',
        headers: {
            // contentType: 'multipart/form-data',
            'Cookie': `SESSDATA=${process.env.SESSDATA.toString()};bili_jct=${process.env.CSRF.toString()}`
        },
        data: form,
    })
        .then(res => res.data)

}


if (fs.existsSync(path + 'add.list')) {
    let addFiles = fs.readFileSync(path + 'add.list', { encoding: 'utf-8' }).split('______');

    console.log('addFiles', addFiles);


    for (var i = 0; i < addFiles.length; i++) {
        if (addFiles[i] == '') continue;
        var temp = {
            data: addFiles[i],

            upload: function (file) {
                console.log('上传文件 '+file);
                return uploadToBili(file)
                    .then(res => {
                        if (res.data && res.data.location) {
                            console.log(new Date() + '上传成功 ' + this.data, res.data);
                            var listPath = `${path}list/${getDir(this.data)}.list`;
                            // 上传成功，往list头部追加数据
                            this.writeFile(`${this.data.substring(this.data.lastIndexOf('/') + 1)}-{"success":true,"result":["${res.data.location.replace('http://', 'https://')+'@1e_1c.webp'}"]}`);
                        } else {
                            console.log(res);
                            process.exit(127);
                        }
                    });
            },
            writeFile: function (value) {
                var listPath = `${path}list/${getDir(this.data)}.list`;
                let d = getListData(getDir(this.data));
                d.unshift(value);
                // 写入文件
                fs.writeFileSync(listPath, d.join('\n').toString(), { encoding: 'utf-8' });
            },

            exec: function () {
                console.log('开始上传了 ' + this.data + "   "+new Date())
                return this.upload(`${path}${this.data}`).catch(e => {
                    console.log("上传出错 ",e);
                    if (e.response.status == 413) {//文件过大，只写入文件名即可
                        
                        fs.mkdirSync(`tmp/${getDir(this.data)}`,{recursive:true});
                        // 尝试压缩后再次上传
                        const out = `tmp/${this.data.replace('png', 'jpg')}`;
                        console.log(`尝试压缩文件到 ${out}`);
                        let _this = this;
                        return new Promise((resolve,reject)=>{
				ffmpeg().input(`${path}${_this.data}`)
                                .audioQuality(80)
                                .on('end',()=>{
                                    if (fs.existsSync(out)) {
                                        _this.upload(out).catch(ex => {
                                            if (ex.response.status == 413) {
                                                console.log(`压缩后仍不能上传 ${path}${_this.data} ${fs.statSync(path+_this.data).size} ${fs.statSync(out).size}`)
                                                _this.writeFile(`${_this.data.substring(_this.data.lastIndexOf('/') + 1)}`);
                                                resolve();
                                            } else {
                                                console.log(ex);
                                                process.exit(127);
                                            }
                                        }).then(resolve)
                                    } else {//可能压缩失败
                                        _this.writeFile(`${_this.data.substring(_this.data.lastIndexOf('/') + 1)}`);
                                        resolve();
                                    }
                                })
                                .on('error', (err) => {
                                    console.log('压缩错误 An error occurred: ' + err.message);
                                    _this.writeFile(`${_this.data.substring(_this.data.lastIndexOf('/') + 1)}`);
                                    resolve();
                                  })
                                .save(out)
                            
                        });
                    } else {
                        console.log(e);
                        process.exit(127);
                    }
                })

            }
        }
        req.push(temp);
    }


    function nextUpload() {
        return req[0].exec().then(res => {
            req.splice(0, 1);
            if (req.length > 0)
                setTimeout(nextUpload, 10000);
        }).catch(e=>{
            console.log(e);
            process.exit(127);
        });
    }
    if (req.length != 0)
        nextUpload();


} else {
    console.log('没有文件 被 添加');
}

if (fs.existsSync(path + 'rename.list')) {
    let renameFiles = fs.readFileSync(path + 'rename.list', { encoding: 'utf-8' }).split('______');
    console.log('rename files ', renameFiles);

    for (var i = 0; i < renameFiles.length; i++) {
        if (renameFiles[i] == '') continue;

        var f = renameFiles[i];

        var fss = f.split(',');// 前面是旧名字，后面是新名字


        // 获取文件夹
        var dir = getDir(fss[0]);
        var newDir = getDir(fss[1]);


        // 读取对应的list文件
        var listPath = `${path}list/${dir}.list`;
        var nlistPath = `${path}list/${newDir}.list`;
        var d = getListData(dir);
        var nd = getListData(newDir);


        var index = d.findIndex(e => e.startsWith(fss[0].replace(`${dir}/`, '')));
        if (index != -1) {
            if(dir==newDir){// 相同目录，替换
                d[index] = d[index].replace(fss[0].replace(`${dir}/`, ''), fss[1].replace(`${dir}/`, ''));
            }else{// 不同目录删除，再往新目录头部追加
                nd.unshift(d[index].replace(fss[0].replace(`${dir}/`, ''), fss[1].replace(`${dir}/`, '')));
                fs.writeFileSync(nlistPath, nd.join('\n').toString(), { encoding: 'utf-8' });
                
                d.splice(index, 1);
            }
            fs.writeFileSync(listPath, d.join('\n').toString(), { encoding: 'utf-8' });
        } else {
            console.log('不存在对应的 文件 list ' + fss[0] + '  ' + fss[1]);

        }


    }

} else {
    console.log('没有文件 被 重命名');
}

if (fs.existsSync(path + 'delete.list')) {
    let deleteFiles = fs.readFileSync(path + 'delete.list', { encoding: 'utf-8' }).split('______');

    for (var i = 0; i < deleteFiles.length; i++) {
        if (deleteFiles[i] == '') continue;

        let dir = getDir(deleteFiles[i]);
        let d = getListData(dir);
        var index = d.findIndex(e => e.startsWith(deleteFiles[i].replace(getDir(deleteFiles[i]))))
        if (index != -1) {
            d.splice(index, 1);
            // 读取对应的list文件
            var listPath = `${path}list/${dir}.list`;
            // 写入文件
            fs.writeFileSync(listPath, d.join('\n').toString(), { encoding: 'utf-8' });
        }

    }

} else {
    console.log('没有文件 被 删除');
}
