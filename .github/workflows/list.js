const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');
const child_process = require('child_process');
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


function uplodaToBili(filepath) {

    const form = new FormData();
    form.append('binary', fs.createReadStream(filepath));//图片文件的key
    // form.append('biz', 'new_dyn');
    // form.append('category', 'daily');
    form.append('csrf', process.env.CSRF.toString());

    return axios.request({
        method: 'POST',
        url: 'https://api.bilibili.com/x/article/creative/article/upcover',
        headers: {
            // contentType: 'multipart/form-data',
            'Cookie': `SESSDATA=${process.env.SESSDATA.toString()}`
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
                return uplodaToBili(file)
                    .then(res => {
                        if (res.data && res.data.url) {
                            console.log(new Date() + '上传成功 ' + this.data, res.data);
                            var listPath = `${path}list/${getDir(this.data)}.list`;
                            // 上传成功，往list头部追加数据
                            this.writeFile(`${this.data.substring(this.data.lastIndexOf('/') + 1)}-{"success":true,"result":["${res.data.url.replace('http://', 'https://')}"]}`);
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

                        // 尝试压缩后再次上传
                        child_process.execSync(`mkdir -p "tmp/${getDir(this.data)}" && ffmpeg -i ${path}${this.data}  -quality 80 tmp/${this.data.replace('png', 'jpg')}`);

                        if (fs.existsSync(`tmp/${this.data.replace('png', 'jpg')}`)) {
                            this.upload(`tmp/${this.data.replace('png', 'jpg')}`).catch(ex => {
                                if (ex.response.status == 413) {
                                    console.log(`压缩后仍不能上传 ${path}${this.data} ${fs.statSync(path+this.data).size} ${fs.statSync('tmp/'+this.data.replace('png', 'jpg')).size}`)
                                    this.writeFile(`${this.data.substring(this.data.lastIndexOf('/') + 1)}`);
                                } else {
                                    console.log(ex);
                                    process.exit(127);
                                }
                            })
                        } else {//可能压缩失败
                            this.writeFile(`${this.data.substring(this.data.lastIndexOf('/') + 1)}`);
                        }

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


        // 读取对应的list文件
        var listPath = `${path}list/${dir}.list`;

        var d = getListData(dir);

        var index = d.findIndex(e => e.startsWith(fss[0].replace(`${dir}/`, '')));
        if (index != -1) {
            d[index] = d[index].replace(fss[0].replace(`${dir}/`, ''), fss[1].replace(`${dir}/`, ''));
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
