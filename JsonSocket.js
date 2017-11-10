var ByteArray = require("ByteArray");
var Msg = require("Msg");

var GameType = require("GameType");
var GameData = require("GameData");
var Player = require("Player")

var GamePlayer = cc.Class({

    properties: {

        // 接口对象
        uiMusic:0,      // 音效组件
        uiLaizi:null,   // 赖子示意区
        uiPizi:null,    // 皮子示意区

        shouPaiQu:null, // 手牌区
        chuPaiQu:null,  // 出牌区
        puPaiQu:null,   // 铺牌区
        gangPaiQu:null, // 杠牌区
        moPaiQu:null,   // 摸牌区
    },

});

var GameJu = cc.Class({
    properties: {
        
        //GamePlayers: [GamePlayer],      // 游戏玩家表
    },
});

var JsonSocket = cc.Class({
    //extends: cc.Component,

    properties: {

        // 接口对象
        uiMusic:0,                      // 音效组件
        uiLaizi:null,                   // 赖子示意区
        uiPizi:null,                    // 皮子示意区


        // 常量
        LOGIN_SERVER: 31,           // 登陆服务器
        GAME_SERVER: 38,            // 游戏服务器

        // 状态查查询常量
        readyState: {
            get: function() {
                if(this._socket)
                    return this._socket.readyState;
                else 
                    return WebSocket.CLOSED;
            },
        },

        isCONNECTING: {
            get: function() {
                return this.readyState == WebSocket.CONNECTING;
            },
        },        

        isOPEN: {
            get: function() {
                return this.readyState == WebSocket.OPEN;
            },
        },

        isCLOSING: {
            get: function() {
                return this.readyState == WebSocket.CLOSING;
            },            
        },

        isCLOSED: {
            get: function() {
                return this.readyState == WebSocket.CLOSED;
            },            
        },

        // 事件响应函数，在发起连接前，应预先设置好。
        onJsonOpen: null,
        onJsonData: null,
        onJsonError: null,
        onJsonClose: null,

        _socket: null,              // WebSocket
        _recvBytes: null,           // ByteArray

        _lasturl: '',               // 最近发起连接的url。
        _lastRecconetTime: 0,       // 最近发起连接的时间。
        _lastRecvTime: 0,           // 最近收到消息的时间。
        _lastSendTime: 0,           // 最近发送消息的时间。
        _lastRcvGameMsgTime:0,

        _lastHallKeepAliveTime: 0,  // 大厅心跳 
        _lastGameKeepAliveTime: 0,  // 游戏心跳
    },

    ctor: function () {
        var t = this;
        window.setInterval( 
            function () {
                t.onTimerTickMsg.call(t);
            }, 300); // 每300毫秒检查超时和心跳。
    },

    closeSocket: function() {
        cc.log("JsonSocket.closeSocket: ");

        if (this._socket) {
            this._socket.onopen = null;
            this._socket.onmessage = null;
            this._socket.onerror = null;
            this._socket.onclose = null;
            this._socket.close();
            this._socket = null;
        }
    },

    /* 通过主机地址和端口发起连接。（具有2秒内重连禁止机制。）
     *
     */
    connectServer: function (host, port) {
        var url = "ws://" + this._host + ":" + this._port;
        this.connectServerByUrl(url);
    },

    /* 通过url发起连接。（具有2秒内重连禁止机制。）
     * 
     */ 
    connectServerByUrl: function (url) {
        cc.log("JsonSocket.connectServerByUrl: ", url);

        // 检查事件响应函数状态。
        if(!this.onJsonOpen)
            cc.warn("JsonSocket.connectServerByUrl: 事件响应函数尚未被设置（onJsonOpen）。");
        if(!this.onJsonData)
            cc.warn("JsonSocket.connectServerByUrl: 事件响应函数尚未被设置（onJsonData）。");
        if(!this.onJsonError)
            cc.warn("JsonSocket.connectServerByUrl: 事件响应函数尚未被设置（onJsonError）。");
        if(!this.onJsonClose)
            cc.warn("JsonSocket.connectServerByUrl: 事件响应函数尚未被设置（onJsonClose）。");


        // 每隔2秒钟才能重连一次。
        var e = Date.now();
        if (e - this._lastRecconetTime < 2e3) {
            cc.warn("JsonSocket.connectServerByUrl: 连接被取消，因为在上次连接后2秒内发起的重连。");
            return;
        }

        // 检查已有socket的状态
        if(this._socket) {
            cc.warn("JsonSocket.connectServerByUrl: 前次连接尚未被关闭，立即强制关闭。");
            this.closeSocket();
        }

        // 开始连接
        this._lasturl = url;
        this._lastRecconetTime = e;
        this._lastSendTime = 0;
        this._lastRecvTime = 0;
        this._lastRcvGameMsgTime = 0;
        this._recvBytes = new ByteArray;
        this._socket = new WebSocket(url); 
        this._socket.binaryType = "arraybuffer";
        // this._socket.onopen = this._onSocketOpen;
        // this._socket.onmessage = this._onSocketMessage;
        // this._socket.onerror = this._onSocketError;
        // this._socket.onclose = this._onSocketClose;

        var t = this;
        this._socket.onopen = function (event) {
            t._onSocketOpen.call(t, event);
        }
        this._socket.onmessage = function (event) {
            t._onSocketMessage.call(t, event);
        }
        this._socket.onerror = function (event) {
            t._onSocketError.call(t, event);
        }
        this._socket.onclose = function (event) {
            t._onSocketClose.call(t, event);
        }

        cc.log("JsonSocket.connectServerByUrl: 已发起连接...", url);
    },

    _onSocketOpen: function(event) {
        cc.log("JsonSocket._onSocketOpen: 连接已经成功...", this._lasturl);

        var x = this;

        this.sendHallMsg(1, 1, {
            u: GameData.userid,
            t: GameData.token,
            v: 1,//GameData.SDK_TYPE,
            g: 3//GameData.GameID
        });   
        if(this.onJsonOpen)
            this.onJsonOpen(event);
    },

    _onSocketMessage: function(event) {
        cc.log("JsonSocket._onSocketMessage: 收到消息...", event);
        this._lastRecvTime = Date.now();

        // 写数据到缓冲区尾部
        var temp = new Uint8Array(event.data);
        this._recvBytes.position = this._recvBytes.length;
        this._recvBytes._writeUint8Array(temp);

        // 从缓冲区头部开始循环读取消息包
        this._recvBytes.position = 0;
        var msg = null;
        while(msg = Msg.tryReadFromByteArray(this._recvBytes)) {
            //this.recvMesages.push(msg);
            if(msg.msgData.b == this.GAME_SERVER) {
                this._lastRcvGameMsgTime = this._lastRecvTime;
            }
            cc.log("JsonSocket._onSocketMessage: 处理消息...", msg.eCmdBig1, msg.dCmd2, msg.hValue1, msg._msgText, msg.msgData, Date.now());
            if(this.onJsonData)
                this.onJsonData(msg.eCmdBig1, msg.dCmd2, msg.hValue1, msg.msgData);
            this.dealMsg(msg.eCmdBig1, msg.dCmd2, msg.hValue1, msg.msgData);
        }

        // 对缓冲区做重整，将读取位置恢复到缓冲区头部。
        if(this._recvBytes.position > 0) {
            if (this._recvBytes.bytesAvailable > 0) {
                cc.log("JsonSocket._onSocketMessage: 有切包，重整缓冲区...");
                var newbytes = new ByteArray;
                newbytes.writeBytes(this._recvBytes, this._recvBytes.position, 0);
                this._recvBytes = newbytes;
            } else {
                this._recvBytes.clear();                
            }
        }
    },

    _onSocketError: function(event) {
        cc.log("JsonSocket._onSocketError: 收到错误...", event);
        this.closeSocket();
        if(this.onJsonError) {
            this.onJsonError(event);
        }        
    },

    _onSocketClose: function(event) {
        cc.log("JsonSocket._onSocketClose: 连接已经关闭...");
        this.closeSocket();
        if(this.onJsonClose) {
            this.onJsonClose(event);
        }        
    },

    sendHallMsg: function (cmd, value, data) {
        this.sendMsg(this.LOGIN_SERVER, cmd, value, data);
    },

    sendGameMsg: function (cmd, value, data) {
        this.sendMsg(this.GAME_SERVER, cmd, value, data);
    },    

    sendMsg: function (server, cmd, value, data) {
        cc.log("JsonSocket.sendMsg: 发送消息...", server, cmd, value, Date.now());

        if (!this.isOPEN) {
            cc.warn("JsonSocket.sendMsg: 连接已经关闭...", server, cmd, value);
            return;
        }

        var msg = new Msg;
        msg.eCmdBig1 = server;
        msg.dCmd2 = cmd;
        msg.hValue1 = value;
        msg.msgData = data;
        var bytes = new ByteArray;
        Msg.WriteToByteArray(bytes, msg);
        this._socket.send(bytes.buffer);
        this._lastSendTime = Date.now();
    },

    _sendMsg: function (server, cmd, value, data) {
        //cc.log("JsonSocket.sendMsg: 发送消息...", server, cmd, value, Date.now());

        if (!this.isOPEN) {
            cc.warn("JsonSocket.sendMsg: 连接已经关闭...", server, cmd, value);
            return;
        }

        var msg = new Msg;
        msg.eCmdBig1 = server;
        msg.dCmd2 = cmd;
        msg.hValue1 = value;
        msg.msgData = data;
        var bytes = new ByteArray;
        Msg.WriteToByteArray(bytes, msg);
        this._socket.send(bytes.buffer);
        this._lastSendTime = Date.now();
    },

    onTimerTickMsg: function () {
        var cur = Date.now();

        // 大厅心跳：连接后生效。
        if (this.isOPEN && cur - this._lastHallKeepAliveTime >= 1e4) {
            this._sendMsg(this.LOGIN_SERVER, 1, 99, {});
            this._lastHallKeepAliveTime = cur;
        }
        // 游戏心跳：游戏中生效。
        if (this.isOPEN && cur - this._lastGameKeepAliveTime >= 5e3) {
            this._sendMsg(this.GAME_SERVER, 1, 99, {});
            this._lastGameKeepAliveTime = cur;
        }

        // 断线检测：游戏中且收到过一次游戏消息生效，监测最近收到的游戏消息。
        if (this.isOPEN && (this._lastRcvGameMsgTime != 0) && (cur - this._lastRcvGameMsgTime >= 3e4)) {
            // 重新发送大厅登陆消息
            this.sendHallMsg(1, 2, {
                u: GameData.userid,
                t: GameData.token,
                n: cur,
            }); 
            this.sendHallMsg(1, 5, {
                u: GameData.userid,
                t: GameData.token,
            });
        }

        // 断线检测：游戏中有效，接收时间超时
        if (this.isOPEN && (this._lastRecvTime != 0) && (cur - this._lastRecvTime >= 14e3)) {
            // 关闭连接，重连
        }
        if (this.isOPEN && (this._lastSendTime != 0) && (cur - this._lastSendTime >= 14e3)) {
            // 关闭连接，重连
        }
    },

    dealMsg: function(server, cmd, val, data) {
        var jserver = data.b; // 服务器类型
        var jparam = data.a;      // 必须为1才处理
        var jcmd = data.t;          // 命令编号
        var jtip = data.r;          // 不等于0表示提示文本。
        var jdata = data.d;          // 数据

        /* 提示消息（data.r!=0）
         * data.d.d 消息文本
         * data.d.r 99表示登陆服务器消息，否则表示游戏消息。登陆服务器提示显示确认和放弃，游戏服务提示消息只显示关闭。
         */
        if (jtip != 0) {
            if(jdata.d) { // s.d 提示文本
                if (jdata.r == 99) { // 登陆服务消息
                    cc.log("Jsocket.dealMsg: Login tip - " + jdata.d);
                    //UIManager.Ins.createSysTipsScene(jdata.d, -1, -1, MsgCmdBig.LoginServer)
                }
                else { // 游戏服务消息
                    cc.log("Jsocket.dealMsg: Game tip - " + jdata.d);
                    //UIManager.Ins.createSysTipsScene(jdata.d)
                }
            }
            return;
        }

        /*
         *
         */
         if (jserver == this.LOGIN_SERVER) {
            switch (jparam) {
                case 1:
                    cc.log("Jsocket.dealMsg: Login cmd - " + jcmd, jdata);
                    switch (jcmd) {
                        case 1: // 登陆确认，更新【玩家访问令牌】
                            cc.log("Jsocket.dealMsg: refresh token - " + jdata.t);
                            GameData.token = jdata.t;
                            this.sendHallMsg(1, 2, {
                                u: GameData.userid,
                                t: GameData.token,
                            }); 
                            this.sendHallMsg(1, 5, {
                                u: GameData.userid,
                                t: GameData.token,
                            });
                            cc.director.loadScene("3.HomeMain");
                            break;
                        case 2: // 更新【玩家基本信息】、【游戏存档记录表】
                            GameData.players[0].nickname = jdata.n;
                            GameData.players[0].ip = jdata.ip;
                            GameData.players[0].score = jdata.c;
                            GameData.players[0].lv = jdata.l;
                            GameData.players[0].sex = jdata.s;
                            //GameData.deskId =
                            var a = jdata.l_d;
                            for (var i in a)
                                if (a.hasOwnProperty(i)) {
                                    var n = a[i],
                                        s = Tool.convertTimeStampStr(1e3 * n.st, Tool.TimeType.YMD),
                                        r = Tool.convertLeftTimeToTimeStr(n.lt),
                                        o = n.i,
                                        l = [],
                                        h = [];
                                    for (var d in o)
                                        if (o.hasOwnProperty(d)) {
                                            var u = o[d];
                                            l.push("" + u.h);
                                            h.push("" + u.n);
                                        }
                                    GameData.savedGameInfo.push({
                                        time: s,
                                        deskid: n.id,
                                        uids: l,
                                        ns: h,
                                        lefttime: r,
                                    })
                                }
                            if (cc.director.getScene().getChildByName('Canvas').getComponent("HomeMain"))
                                cc.director.getScene().getChildByName('Canvas').getComponent("HomeMain").refreshUI();
                            //this.hall.showHallInfo();
                            // TODO：显示分数统计吧。
                            //if (e.h_s)
                            //    this.createSummaryScene(e.h_s, !0);
                            break;
                        case 5: // 更新用户支付信息，房卡数。
                            GameData.players[0].props = [];
                            var t = GameData.players[0].props;
                            for (var a in jdata)
                                if (jdata.hasOwnProperty(a)) {
                                    var i = jdata[a],
                                        n = i.i,
                                        s = i.n;
                                    t.push(new Player.ProInfo(n, s));
                                }
                            GameData.players[0].ufangka = Player.ProInfo.findFankNum(GameData.players[0].props);
                            if (cc.director.getScene().getChildByName('Canvas').getComponent("HomeMain"))
                                cc.director.getScene().getChildByName('Canvas').getComponent("HomeMain").refreshUI();
                            break;
                        case 6: // 更新最近比分。
                            var t = jdata.l_s;
                            var jscores = jdata.l_s;
                            GameData.latestScores = [];
                            for (var jscorekey in jscores)
                                if (jscores.hasOwnProperty(jscorekey)) {
                                    var jscore = jscores[jscorekey];
                                    var n = [];
                                    for (var s in jscore.u)
                                        if (jscore.u.hasOwnProperty(s)) {
                                            var r = jscore.u[s];
                                            n.push({
                                                id: "" + r.id,
                                                n: r.n,
                                                s: r.s,
                                            });
                                        }
                                    GameData.latestScores.push({
                                        ct: jscore.ct,              // 时间：Tool.convertTimeStampStr(1e3 * this.data.ct, TimeType.YMD)
                                        id: jscore.id,              // 
                                        rl: jscore.rl,              // 规则：Tool.getGameNameByRule(this.data.rl); // 口口翻、开口翻
                                        u: n,                       // for (var e = this.data.u.length, t = 0; e > t; t++)
                                                                    //     Tool.setPicById(this.data.u[t].id, this["imgHead" + t])
                                        s: jscore.js || jscore.s,   // 分数："" + (this.data.s >= 0 ? "+" + this.data.s : this.data.s)
                                        n: jscore.n,
                                        gn: jscore.gn || 0,         // 圈数："" + this.data.gn + (this.data.quan ? "圈" : "局")
                                        quan: 1 == jscore.q,        // 单位：圈、局
                                    })
                                }                        
                            break;
                        case 7: // 复盘指令
                            // var i = UIManager.Ins;
                            // FuPan.Ins.isModeOn && (ShareRecord.Ins.clearShareInfo(), 
                            //     UIManager.Ins.removeDeskScene(), 
                            //     SocketManager.Ins.sendHallMsg(1, 2, {
                            //         u: GameData.userid,
                            //         t: GameData.token
                            //     }), 
                            //     SocketManager.Ins.sendHallMsg(1, 5, {
                            //         u: GameData.userid,
                            //         t: GameData.token
                            //     }), 
                            //     UIManager.Ins.createHallScene(), 
                            //     UIManager.Ins.removeFupanCoverScene(), 
                            //     FuPan.Ins.reset(), 
                            //     FuPan.Ins.isModeOn = !1), 
                            // GameData.deskId = jdata.i || 0, 
                            // GameData.players[0].state == PlayerState.HALL && (0 == GameData.deskId ? 
                            //     SocketManager.Ins.sendGameMsg(1, 60, {
                            //         u: GameData.userid,
                            //         t: GameData.token,
                            //         i: 0
                            //         }) 
                            //     : 
                            //     this.sendJoinMsg(GameData.deskId));
                            break;
                        case 8: // 更新声音、皮肤等配置。
                            // var t = !0;
                            // for (var a in jdata)
                            //     if (jdata.hasOwnProperty(a)) {
                            //         var i = jdata[a],
                            //             n = i.r;
                            //         if (0 == n) {
                            //             GameData.musicCfg.bgm = 0 == i.vb;
                            //             GameData.musicCfg.dpm = 0 == i.vc;
                            //         }
                            //         else if (n == CSkin.SETTING_SKIN)
                            //             i.skin && (CSkin.config = i.skin);
                            //         else {
                            //             var s = i.f,
                            //                 r = i.j,
                            //                 o = i.l;
                            //             t && (GameData.sltWFRuleIndex = n, t = !1), 
                            //             GameData.createCfg[n].fs = s, 
                            //             GameData.createCfg[n].js = r, 
                            //             GameData.createCfg[n].lz = o, 
                            //             GameData.createCfg[n].lj = null == i.lj ? 
                            //                 FBValues.FB_ON 
                            //                 : i.lj, 
                            //             GameData.createCfg[n].ll = null == i.ll ? 
                            //                 FBValues.FB_ON 
                            //                 : i.ll, 
                            //             GameData.createCfg[n].fl = null == i.fl ? 
                            //                 FBValues.FB_ON 
                            //                 : i.fl, 
                            //             GameData.createCfg[n].xy = null == i.xy ? 
                            //                 FBValues.FB_OFF 
                            //                 : i.xy;
                            //         }
                            //     }
                            // GameData.isFirstTimeGetCfg && (
                            //     GameData.isFirstTimeGetCfg = !1, 
                            //     this.createDesk && this.createDesk.initUI(GameData.sltWFRuleIndex), 
                            //     GameData.musicCfg.bgm ? Tool.playBgm() : Tool.stopBgm());
                            break;
                        case 9: // 更新头像
                            // var t = jdata.u, a = jdata.t;
                            // Tool.isNullOrEmpty(a) && (a = ""), 
                            // GameData.headPicInfos[t].url = a, 
                            // GameData.headPicInfos[t].imgs.forEach(function(e) {
                            //     e.source = a
                            // }), 
                            // GameData.headPicInfos[t].imgs = [];
                            break;
                        case 10: // 重新登陆指令
                            // GameData.players[0].initLoginInfo(), 
                            // this.removeAllScene(), 
                            // this.createLoginScene();
                            // var t = jdata.t;
                            // this.createSysTipsScene(t), 
                            // SocketManager.Ins.initSocket();                       
                            break;
                        case 11: // 滚动提示
                                var txt = jdata.t;
                                //null != this.hall && null != this.hall.parent && this.hall.addRollTip(t)
                            break;
                        case 16: // 关闭微信场景，进行文本提示
                            //0 == jdata.i && GameData.SDK_TYPE == SDKType.WEB_CODE && setWxpage(!1, ""), 1 == jdata.t && this.createSysTipsScene(jdata.s)
                            break;
                        case 17: // 复盘相关功能
                            // var t = jdata.n,
                            //     a = jdata.d,
                            //     i = jdata.ct,
                            //     n = jdata.id,
                            //     s = jdata.f;
                            // if (-1 != GameData.deskId && GameData.deskId != n)
                            //     void ShareRecord.Ins.clearShareInfo();
                            // else {
                            //     if (i != FuPan.Ins.ct || n != FuPan.Ins.id) 
                            //         FuPan.Ins.init(i, n);
                            //     if (0 == t) {
                            //         if (Array.isArray(a)) 
                            //             a.forEach( function(e) {
                            //                 FuPan.Ins.dealFPMsg(e.b, e.a, e.t, e.r, e.d);
                            //             });
                            //         ShareRecord.Ins.showZJDetailOrGetRecord();
                            //     } 
                            //     else if (0 == s) 
                            //         FuPan.Ins.msgArr = a; 
                            //     else if(1 == s) 
                            //         FuPan.Ins.msgArr = FuPan.Ins.msgArr.concat(a)
                            //     else if(2 == s) {
                            //         FuPan.Ins.msgArr = FuPan.Ins.msgArr.concat(a);
                            //         FuPan.Ins.curReNum = t; 
                            //         FuPan.Ins.play();
                            //     }
                            // }
                            break;
                        case 18: // 显示该局战绩
                            //null != jdata.i ? this.createSummaryScene(jdata, !0) : this.createSysTipsScene("无法查看该局游戏的总战绩！")
                            break;
                        case 99: // 连接心跳，是否需要发响应包呢？
                            break;
                    }
                    break;
            }
        } else if (jserver == this.GAME_SERVER) {
            switch (jparam) {
                case 1:
                    cc.log("Jsocket.dealMsg: Game cmd - " + jcmd, jdata); 
                    switch (jcmd) {
                        case 1: //.OK. 
                                // 【传输】牌桌数据（编号，类型、房主、规则）
                                // 【命令】进入牌桌场景
                                // 【命令】进入等待场景，允许用户确认或退出。
                                //
                                //  1. 维护服务器端数据
                                //  2. 向每个玩家或观众发送数据
                                //  3. 处理玩家或观众发送的数据
                                //  4. 处理系统事件。
                                //
                            if (jdata.r > 0) {
                                GameData.deskId = jdata.r;
                                GameData.deskType = GameType.DeskType.FANG_KA;
                                GameData.players[0].isDeskManager = 1 == jdata.t;
                                GameData.isSavedGame = jdata.b;
                                GameData.isWaiting = jdata.d;
                                GameData.deskWF = jdata.n;
                                GameData.deskFX = jdata.an;
                                GameData.maxJuShu = jdata.g;
                                GameData.currJuShu = 0;
                                GameData.maxQuan = jdata.qs || 0;
                                GameData.currQuan = 0; 
                                GameData.lianjinFlag = jdata.lj == GameType.FBValues.FB_ON ? !0 : !1;
                                GameData.lianlaiFlag = jdata.ll == GameType.FBValues.FB_ON ? !0 : !1;
                                GameData.fenglaiFlag = jdata.fl == GameType.FBValues.FB_ON ? !0 : !1;
                                GameData.xiayuFlag = jdata.xy == GameType.FBValues.FB_ON ? !0 : !1; 
                                GameData.fanShu = jdata.f;
                                GameData.gameRule = jdata.l; 
                                GameData.players.forEach(function(e) {
                                    if (e.seatType != GameType.SeatType.BOT) 
                                        e.initLoginInfo();
                                });
                                //TODO: 
                                //this.removeHallScene();
                                //this.createDeskScene();
                                //if (1 == GameData.isWaiting)
                                //    this.createWaitingScene();
                            }
                            break;
                        case 2: // 【命令】进入游戏环节
                            this.removeWaitingScene();
                            Tool.setBgmVolume(.2); 
                            this.desk.hideStartUI(); 
                            GameData.deskFX = json.an; 
                            this.desk.initData();
                            GameData.players.forEach(function(e) {
                                e.state = PlayerState.DESK_PLAYING; 
                                e.hideReady();
                            });
                            this.removeScoreScene(); 
                            this.createStartAni(); 
                            if (GameData.musicCfg.bgm)
                                Tool.playMusic("start.mp3");
                            if (GameData.deskType == DeskType.FANG_KA && 1 == GameData.currJuShu && GameData.currQuan <= 1)
                                Tool.census("kaishiyouxi");
                            break;
                        case 3: // 【传输】牌局信息（局数、圈数、庄）、
                                // 【传输】玩家列表。
                            var t = jdata.f;
                            if (1 == t) {
                                GameData.currJuShu = jdata.js;
                                GameData.currQuan = jdata.qs; 
                                GameData.currZhuang = jdata.zs;
                                this.desk.showCurrentDeskInfo();
                                GameData.players[0].state = PlayerState.DESK_PLAYING;
                            }
                            var a = jdata.u;
                            for (var i in a)
                                if (a.hasOwnProperty(i)) {
                                    var n = a[i],
                                        s = n.s,
                                        r = GameData.players[s];
                                    r.userid = "" + n.id;
                                    r.nickname = n.n; 
                                    r.ip = n.ip;
                                    r.sex = n.sex; 
                                    r.isDeskManager = 1 == n.ic;
                                    r.score = GameData.deskType == DeskType.FANG_KA ? n.js || 0 : n.c;
                                    r.rank = n.r;
                                    var o = null == n.la ? -1 : n.la;
                                    var l = null == n.lo ? -1 : n.lo;
                                    LocSDK.Ins.onGetLocation(s, l, o);
                                    if (0 == s || r.state != PlayerState.UNLOGIN)
                                        r.state = PlayerState.DESK_PLAYING;
                                }
                            if (GameData.SDK_TYPE != SDKType.WEB_CODE && GameData.deskType == DeskType.FANG_KA && 0 == GameData.currJuShu) 
                                LocSDK.Ins.showPlayersDistaceTips(); 
                            this.desk.showAllPlayerInfo(); 
                            if (this.waiting && this.waiting.parent) {
                                    this.waiting.showAllPlayerInfo();
                                    if (GameData.deskType == DeskType.FANG_KA && GameData.SDK_TYPE == SDKType.WEB_GZH) 
                                        this.waiting.register(!1);
                            }
                            break;
                        case 4: // 【传输】玩家摸牌动作
                            var t = jdata.c,  // 摸牌信息
                                a = jdata.s,  // 操作玩家
                                i = jdata.n;  // 剩余牌数
                            GameData.players[a].moPai(t, GameData.ANI_DAPAI_FLAG, !0);
                            if (i > 3)
                                this.desk.showLeftCardsNum(i);
                            else
                                this.desk.showLeftCardsNum(0); 
                            if (a != SeatType.BOT)
                                this.desk.hideOperateUI(); 
                            if (1 == jdata.p) {
                                GameData.gangCardNum += 1;
                                this.desk.setHunLack();
                            }
                            break;
                        case 5: // 【传输】庄。
                            this.removeWaitingScene(); 
                            GameData.bankerSeat = jdata.s; 
                            this.desk.showZhuangPic(GameData.bankerSeat); 
                            this.desk.showHunCards(!0);
                            // this.imgHunBigCard1 || (this.imgHunBigCard1 = new MJCard(0, CardType.HAND_TOP);
                            // this.imgHunBigCard1.x = 5, this.imgHunBigCard1.y = 5; 
                            // this.hunBigGroup.addChild(this.imgHunBigCard1); 

                            // this.imgPiBigCard1 = new MJCard(0, CardType.HAND_TOP);
                            // this.imgPiBigCard1.x = 0, this.imgPiBigCard1.y = 5; 
                            // this.piBigGroup.addChild(this.imgPiBigCard1); 
                            // this.imgPiBigCard2 = new MJCard(0, CardType.HAND_TOP); 
                            // this.imgPiBigCard2.x = 60, this.imgPiBigCard2.y = 5;
                            // this.piBigGroup.addChild(this.imgPiBigCard2);
                            // this.imgPiBigCard3 = new MJCard(0, CardType.HAND_TOP);
                            // this.imgPiBigCard3.x = 120, this.imgPiBigCard3.y = 5;
                            // this.piBigGroup.addChild(this.imgPiBigCard3));
                            // GameData.gameRule == GameRuleType.KKF ? 
                            //     this.hun_bg.width = 220 
                            // : 
                            //     this.hun_bg.width = 180;
                            //  e ? (
                            //     0 == GameData.lzpCard.length || 0 == GameData.lzCard ? (
                            //         this.imgHunBigCard1.setType(CardType.HAND_TOP);
                            //         this.imgPiBigCard1.setType(CardType.HAND_TOP);
                            //         this.imgPiBigCard2.setType(CardType.HAND_TOP);
                            //         this.imgPiBigCard3.setType(CardType.HAND_TOP);
                            //     ) : (
                            //         this.imgHunBigCard1.cardType = CardType.HAND_ME;
                            //         this.imgHunBigCard1.setValue(GameData.lzCard);
                            //         this.imgPiBigCard1.cardType = CardType.HAND_ME;
                            //         this.imgPiBigCard1.setValue(GameData.lzpCard[0] || 0); 
                            //         this.imgPiBigCard2.cardType = CardType.HAND_ME;
                            //         this.imgPiBigCard2.setValue(GameData.lzpCard[1] || 0);
                            //         this.imgPiBigCard3.cardType = CardType.HAND_ME;
                            //         this.imgPiBigCard3.setValue(GameData.lzpCard[2] || 0); 
                            //         this.setHunLack();
                            //     ); 
                            //     this.imgPiBigCard3.visible = GameData.gameRule == GameRuleType.KKF;
                            //     this.imgHunBigCard1.width = 60;
                            //     this.imgHunBigCard1.height = 80, this.imgPiBigCard1.width = 60;
                            //     this.imgPiBigCard1.height = 80, this.imgPiBigCard2.width = 60;
                            //     this.imgPiBigCard2.height = 80, this.imgPiBigCard3.width = 60;
                            //     this.imgPiBigCard3.height = 80, this.hunGroup.visible = !0
                            // ) : 
                            //     this.hunGroup.visible = !1;
                            break;
                        case 6: // 【传输】打牌操作动作
                            var t = jdata.s,  // 打牌的玩家
                                a = jdata.c,  // 打出的牌
                                i = jdata.i,
                                n = GameData.players[t];
                            n.dpFlag = !1;
                            n.daPai(a, i); 
                            this.desk.hideOperateUI();
                            if (GameData.musicCfg.dpm) {
                                var s = Tool.getHuase(a);
                                if (s == CardColor.TONG)
                                    s = CardColor.WAN;
                                else if (s == CardColor.WAN) 
                                    s = CardColor.TONG;
                                var r = Math.floor(2 * Math.random()) + 2,
                                    o = "v27" + 10 * (t % 2 + 1) + (2 == n.sex ? 0 : 1) + r + s + Tool.getPaizhi(a) + ".mp3";
                                Tool.playMusic(o);
                            }                        
                            break;
                        case 7: // 【传输】癞子、癞子信息
                            var t = jdata.l;
                            GameData.lzCard = t[0] || 0;
                            for (var a = 1; a < t.length; a++)
                                GameData.lzpCard[a - 1] = t[a] || 0;
                            this.desk.showHunCards(!0); 
                            this.desk.playSepLai(e.c); 
                            if (SocketManager.Ins.msgDealEnable) {
                                var i = GameData.players[0],
                                    n = void 0;
                                i.handCards.length % 3 == 2 && (n = i.handCards.pop()), 
                                i.sortHandCards(), 
                                i.showHandCards(), 
                                n && i.handCards.push(n), 
                                i.setHandHunBlink();
                            }                        
                            break;
                        case 8: // 【传输】当前操作玩家
                            var t = jdata.s,
                                a = jdata.o,
                                i = jdata.k,
                                n = jdata.d,
                                s = jdata.b > 20 ? 20 : jdata.b,
                                r = GameData.players[t];
                            this.desk.showTime(-1);
                            this.desk.showTime(s);
                            this.desk.showOperPlayerAni(t);
                            this.desk.hideGangCardsSelectUI(); 
                            if (t == SeatType.BOT)
                                if (r.dpFlag = !1, 1 == n && (r.dpFlag = !0), r.opCheck = i, r.oper = a, r.liangFlag)
                                    a > 1 && (r.isTuoGuan || this.desk.showOperateUI());
                                else if (r.isTuoGuan || this.desk.showOperateUI(), r.tingCardsInfos = [], 0 != (a & OperType.LIANG)) {
                                    var o = e.tl,
                                        l = e.hc;
                                    for (var h in o)
                                        if (o.hasOwnProperty(h)) {
                                            var d = o[h],
                                                u = l[h],
                                                c = new Array;
                                            for (var p in u)
                                                if (u.hasOwnProperty(p)) {
                                                    var g = u[p];
                                                    c.push(g)
                                                }
                                            r.tingCardsInfos.push({
                                                outCV: d,
                                                huCVs: c
                                            })
                                        }
                                }                        
                            break;
                        case 9:  // 【传输】玩家动作：吃、碰、明杠、暗杠、开杠、胡牌
                            var t,
                                a = jdata.s, // 玩家
                                i = jdata.o, // 操作
                                n = (jdata.p, jdata.l), // ??? jdata.l 牌组
                                s = GameData.players[a],
                                r = 0,
                                o = Math.floor(2 * Math.random());
                            switch (null != n && (r = n[0]), i) {
                            case OperType.CHI:
                                s.chi(n), t = "01";
                                break;
                            case OperType.PENG:
                                s.peng(r), t = 1 == o ? "02" : "06";
                                break;
                            case OperType.MING_GANG:
                                s.mingGang(r), t = 1 == o ? "03" : "07";
                                break;
                            case OperType.AN_GANG:
                                s.anGang(r), t = 1 == o ? "03" : "07";
                                break;
                            case OperType.KAI_GANG:
                                s.kaiGang(r), t = 1 == Tool.isHun(r) ? "05" : 2 == Tool.isHun(r) ? "04" : 1 == o ? "03" : "07";
                                break;
                            case OperType.HU:
                                var l = 1 == e.z ? !0 : !1;
                                s.hu(l), t = "09"
                            }
                            if (GameData.musicCfg.dpm) {
                                var h = "v27" + 10 * (a % 2 + 1) + (2 == s.sex ? 0 : 1) + (2 == s.sex ? 2 : 3) + t + ".mp3";
                                Tool.playMusic(h)
                            }
                            this.desk.hideOperateUI(), this.desk.hideGangCardsSelectUI(), this.desk.zhaFlag = !1                        
                            break;
                        case 10: // 【传输】玩家动作：胡牌
                            GameData.players[0].moPai(-1, GameData.ANI_DAPAI_FLAG); 
                            this.desk.showTime(-1);
                            this.desk.showOperPlayerAni(-1);  // 头像动画
                            this.desk.hideQXTG();
                            for (var t in jdata)
                                if (jdata.hasOwnProperty(t)) {
                                    var a = parseInt(t),
                                        i = jdata[t],
                                        n = GameData.players[a];
                                    n.liangFlag = !0;
                                    var s = new Array;
                                    for (var r in i)
                                        if (i.hasOwnProperty(r)) {
                                            var o = i[r];
                                            s.push(o)
                                        }
                                    if (s.length % 3 == 2)
                                        if (n.huCard) {
                                            for (var l = 0; l < s.length; l++)
                                                if (s[l] == n.huCard.value) {
                                                    s.splice(l, 1);
                                                    break
                                                }
                                        } else {
                                            var h = s.pop();
                                            n.huCardDaopu(h)
                                        }
                                    s.sort(Tool.sortCardValue), n.liang([], s)
                                }                        
                            break;
                        case 11: // 【命令】显示分数场景
                            this.desk.hideOperateUI();
                            this.desk.hideZhuangPic();
                            this.desk.showOperPlayerAni(-1);
                            this.desk.hideDisTips(); 
                            this.desk.hideQXTG();
                            this.desk.showTime(-1);
                            this.desk.showHunCards(!1);
                            this.desk.showLeftCardsNum(-1);
                            this.desk.setUserBaohu(null);
                            GameData.players.forEach(function(e) {
                                e.isReady = !1
                            });

                            var t = new ScoreInfo;
                            t.banker = e.b;
                            if (-1 == GameData.maxJuShu) 
                                t.wf = GameData.deskWF
                            else 
                                t.wf = GameData.deskWF + "(" + GameData.currJuShu + "/" + GameData.maxJuShu + ")"; 
                            t.rule = Tool.getGameNameByRule(GameData.gameRule); 
                            t.huangzhuangflag = e.h; 
                            t.yingFlag = e.y; 
                            t.lianlai = e.c; 
                            t.dahuFlag = e.d;
                            var a = e.p;
                            GameData.hisScores.push(t);
                            t.lzCards.push(GameData.lzCard);
                            GameData.lzpCard.forEach(function(e) {
                                t.lzCards.push(e)
                            });
                            for (var i in a)
                                if (a.hasOwnProperty(i)) {
                                    var n = a[i],
                                        s = n.s,
                                        r = GameData.players[s];
                                    t.nicknames[s] = r.nickname;
                                    t.userid[s] = r.userid;
                                    t.huTypeStrs[s] = n.n;
                                    t.zjZFs[s] = n.x; 
                                    t.zjJSFs[s] = n.js || 0;
                                    t.zjGFs[s] = n.gf; 
                                    t.zjKKFs[s] = n.o; 
                                    t.huTypeFlag[s] = n.z;
                                    t.baohuFlag[s] = n.bh;
                                    t.fengdingFlag[s] = n.f; 
                                    t.lianjin[s] = n.lj; 
                                    t.fanjin[s] = n.fj; 
                                    t.weikaikou[s] = n.kk;
                                }
                            this.desk.clearDeskCards();
                            GameData.players.forEach(function(e) {
                                e.initLzDpNum();
                                t.lzdpInfos.push(e.lzdpInfos); 
                                t.dpInfos.push(e.dpInfos); 
                                t.huHandCards.push(e.handCards); 
                                t.huCards.push(e.huCard);
                            });
                            var o = e.ov,
                                l = ScoreInfoType.NEXT_GAME;
                            if (0 == o) {
                                l = ScoreInfoType.LEAVE_DESK;
                                GameData.isGameOver = !0; 
                                GameData.players[0].state = PlayerState.DESK_WAITING; 
                            }
                            if (GameData.deskType == DeskType.LIAN_XI) {
                                this.createWaitingScene(); 
                                l = ScoreInfoType.LIAN_XI;
                            } 
                            this.createScoreScene(t, l);
                            var h = GameData.curGameScore.gsInfo.length;
                            GameData.curGameScore.gsInfo.push({
                                index: h + 1,
                                s: t.zjJSFs,
                                si: t
                            });
                            break;
                        case 12: // 【传输】用户报胡
                            for (var t in jdata)
                                if (jdata.hasOwnProperty(t)) {
                                    var a = jdata[t];
                                    this.desk.setUserBaohu(a.s, 1 == a.v)
                                }                        
                            break;
                        case 19: // 发牌
                            this.removeWaitingScene();
                            var t = jdata[0];
                            this.desk.hideStartUI();
                            this.desk.showTime(-1); 
                            this.desk.faPai([t]);                        
                            break;
                        case 23:  // 【刷新】剩余等待时间
                             var t = jdata.t;
                             if (null != this.waiting) 
                                this.waiting.showLeftStartTime(t)
                            break;
                        case 24: // 【】更新房间编号，显示系统提示。这应该是加入房间吧？？ 
                            var t = jdata.ts;
                            GameData.deskId = jdata.r; 
                            this.createSysTipsScene(t, 1, 24, MsgCmdBig.GameServer)
                            break;
                        case 25: // 【】显示玩家离线提示
                            var t = jdata.ts,
                                a = jata.t;
                            this.desk.showDisTips(t, a);
                            break;
                        case 26: // 【】胡牌么？
                            var t = jdata.s,
                                a = jdata.c,
                                i = jdata.z;
                            this.desk.showTime(-1);
                            this.desk.showOperPlayerAni(-1);
                            var n = GameData.players[t];
                            if (12 != i)
                                n.huCardDaopu(a);
                        // }, e.prototype.huCardDaopu = function(e) {
                            // var t = this.handCards.length;
                            // t % 3 == 2 ? (
                            //     this.huCard = this.handCards.pop();
                            //     this.huCard.cardType = this.dCardType;
                            //     t = this.handCards.length;
                            // ) : (
                            //     this.huCard = new MJCard(e, this.dCardType);
                            //     this.seatType == SeatType.RIGHT ? 
                            //         this.hGroup.addChildAt(this.huCard, 0) 
                            //     : 
                            //         this.hGroup.addChild(this.huCard);
                            // ) 
                            // egret.Tween.removeTweens(this.huCard);
                            // this.huCard.setValue(e);
                            // this.huCard.isGray && (this.huCard.maskColor = CardMask.NONE);
                            // var a,
                            //     i,
                            //     n = GameData.dCardSize[this.seatType].w,
                            //     s = GameData.dCardSize[this.seatType].h,
                            //     r = this.dpInfos.length,
                            //     o = (this.lzdpInfos.length, {
                            //         x: GameData.dpOffset.x * r,
                            //         y: GameData.dpOffset.y * r
                            //     });
                            // switch (this.seatType) {
                            //     case SeatType.BOT:
                            //         a = t * n + 3 * r * n + GameData.liangDiffXY.x + 10 + o.x, i = GameData.liangDiffXY.y;
                            //         break;
                            //     case SeatType.RIGHT:
                            //         a = 0, i = this.hGroup.height - (t + 1) * s - 3 * r * s - 25 - o.y;
                            //         break;
                            //     case SeatType.TOP:
                            //         a = this.hGroup.width - (t * n + 3 * r * n + 18 + o.x), i = 0;
                            //         break;
                            //     case SeatType.LEFT:
                            //         a = 0, i = t * s + 3 * r * s + 25 + o.y
                            // }
                            // this.huCard.x = a, this.huCard.y = i
                            // break;
                        case 27: //
                            GameData.curGameScore = {
                                ids: [],
                                ns: [],
                                gsInfo: []
                            };
                            var t = [];
                            for (var a in e)
                                if (e.hasOwnProperty(a)) {
                                    var i = e[a];
                                    GameData.curGameScore.ns.push(i.n), GameData.curGameScore.ids.push("" + i.id);
                                    var n = GameData.deskType == DeskType.FANG_KA ? i.js : i.hs,
                                        s = [];
                                    for (var r in n)
                                        if (n.hasOwnProperty(r)) {
                                            var o = n[r];
                                            s.push(o)
                                        }
                                    t.push(s)
                                }
                            for (var l = t[0], h = t[1], d = t[2], u = t[3], c = 0; c < l.length; c++)
                                GameData.curGameScore.gsInfo.push({
                                    index: c + 1,
                                    s: [l[c], h[c], d[c], u[c]],
                                    si: null
                                })
                            break;
                        case 28: // *显示玩家准备按钮界面
                            this.desk.showStartUI();
                            break;
                        case 29: // *显示玩家准备状态。会收到多次。
                            var t = jdata.s; // 玩家
                            var a = jdata.r; 
                            if (0 == a) { 
                                GameData.players[t].ready();
                                if (t == SeatType.BOT) { 
                                    this.desk.hideStartUI(); 
                                    this.removeScoreScene();
                                }
                                if (null != this.waiting)
                                    this.waiting.showAllPlayerInfo();
                                if (null != this.score && this.score.visible) 
                                    this.score.showReady(t);
                            }
                            break;
                        case 30: // *通知玩家在线状态：牌桌、大厅、未登陆，是否离线
                            var t = jdata.s,
                                a = jdata.c,
                                i = jdata.o,
                                n = GameData.players[t];
                            if (t != SeatType.BOT) {
                                if (0 == a) 
                                    n.state = PlayerState.DESK_PLAYING 
                                else if (2 == a) 
                                    n.state = PlayerState.HALL
                                else 
                                    n.state = PlayerState.UNLOGIN;
                                this.desk.showAllPlayerInfo();
                                if (null != this.waiting && this.waiting.visible)
                                    this.waiting.showAllPlayerInfo();
                                if (0 == i) 
                                    this.desk.hideDisTips();
                            }
                            break;
                        case 31: // 票数：除了显示20秒倒计时，没有实质功能。
                            this.removeWaitingScene();
                            this.desk.showPiaoUI();
                            this.desk.showTime(20)
                            break;
                        case 32: // 票数：除了显示20秒倒计时，没有实质功能。
                            var a = jdata.s;
                            if (a == SeatType.BOT) 
                                this.desk.hidePiaoUI();
                            GameData.players[a].piao(jdata.i, 0 == jdata.f);
                            UIManager.Ins.desk.showAllPlayerInfo();
                            break;
                        case 33: // 显示计分场景
                            var t = !0,
                                a = jdata.ov;
                            if (0 == a && this.score && this.score.parent && this.score.visible) 
                                t = !1;
                            this.createSummaryScene(jdata, t);
                            break;
                        case 35: // 提示场景
                            var t = jdata.t;
                            this.createSysTipsScene(jdata.st, 1, 35, MsgCmdBig.GameServer, t, "btn_ty_png", "btn_bty_png")
                            break;
                        case 36: // 游戏结束，重新登陆大厅
                            this.removeWaitingScene(), this.removeDeskScene();
                            var t = GameData.players[0];
                            SocketManager.Ins.sendHallMsg(1, 2, {
                                u: t.userid,
                                t: t.token
                            }), SocketManager.Ins.sendHallMsg(1, 5, {
                                u: t.userid,
                                t: t.token
                            }), this.createHallScene(), GameData.isGameOver || this.createSysTipsScene(e.t, 1, 36), GameData.isGameOver = !1
                            break;
                        case 38: // 询问场景，有【同意】、【不同意】按钮。
                            var t = jdata.t;
                            this.createSysTipsScene(jdata.st, 1, 38, MsgCmdBig.GameServer, t, "btn_ty_png", "btn_bty_png")
                            break;
                        case 40: // 玩家发言
                            var t = jdata.s;
                            GameData.players[t].chat(jdata)
                            break;
                        case 52: // 托管操作应答。应该是按了托管按钮、取消托管按钮后会显示。
                            var t = jdata.t,
                                a = jdata.s,
                                i = jdata.lt;
                            if (a == SeatType.BOT) {
                                GameData.players[0].isTuoGuan = 1 == t;
                                if (GameData.players[0].isTuoGuan) {
                                    this.desk.hideOperateUI(); 
                                    this.desk.showQXTG();
                                } else {
                                    this.desk.hideQXTG();
                                    if (GameData.players[0].oper > 1 && i > 0) 
                                        this.desk.showOperateUI();
                                    this.desk.showTime(i);
                                }
                            }
                            break;
                        case 58: // 玩家定位消息，显示玩家距离提示
                            var t = jdata.s,
                                a = (GameData.players[t], LocSDK.Ins.location[t] = []),
                                i = jdata.p;
                            for (var n in i)
                                if (i.hasOwnProperty(n)) {
                                    var s = i[n],
                                        r = null == s.lo ? -1 : s.lo,
                                        o = null == s.la ? -1 : s.la;
                                    LocSDK.Ins.onGetLocation(t, r, o), a.push({
                                        lo: r,
                                        la: o
                                    })
                                }
                            if (GameData.SDK_TYPE != SDKType.WEB_CODE && GameData.deskType == DeskType.FANG_KA && 0 == GameData.currJuShu) 
                                LocSDK.Ins.showPlayersDistaceTips();
                            break;
                        case 59: // 通知玩家位置
                            var t = jdata.s,
                                a = null == jdata.la ? -1 : jdata.la,
                                i = null == jdata.lo ? -1 : jdata.lo;
                            LocSDK.Ins.onGetLocation(t, i, a);
                            break;
                        case 60: // 进入练习牌桌
                            GameData.deskId = 0;
                            GameData.deskType = DeskType.LIAN_XI;
                            GameData.players[0].isDeskManager = !1;
                            GameData.deskWF = jdata.n;
                            GameData.deskFX = jdata.an;
                            GameData.gameRule = jdata.l; 
                            GameData.fanShu = jdata.f;
                            GameData.maxJuShu = -1;
                            GameData.maxQuan = -1;
                            GameData.rankInfo = [];
                            GameData.players.forEach(function(e) {
                                if (e.seatType != SeatType.BOT)
                                    e.initLoginInfo();
                            });
                            this.removeHallScene(); 
                            this.createDeskScene(); 
                            this.createWaitingScene();
                            break;
                        case 61: // 系统提示
                            var t = jdata.t;
                            this.createSysTipsScene(t)
                            break;
                        case 63: // 排名信息
                            GameData.rankEndTime = 1e3 * (null == jdata.l ? 0 : jdata.l) + Date.now();
                            if (null != this.desk) 
                                this.desk.showCurrentDeskInfo(); 
                            if (null != this.waiting) 
                                this.waiting.showLeftRankTime();
                            var t = GameData.players[0];
                            t.rank = json.r;
                            t.score = json.s;
                            var a = json.d;
                            for (var i in a)
                                if (a.hasOwnProperty(i)) {
                                    var n = a[i],
                                        s = n.r;
                                    if (1 == s) 
                                        GameData.rankInfo = []; 
                                    GameData.rankInfo[s - 1] = {
                                        i: n.r,
                                        n: n.n,
                                        s: n.s
                                    }
                                }
                            if (null != this.rank)
                                this.rank.updateData();
                            this.desk.showAllPlayerInfo();
                            break;
                        case 99: // 游戏心跳
                            break;
                        case 102: // 游戏开始
                            this.removeWaitingScene();
                            this.desk.initData();
                            this.desk.hideStartUI();
                            GameData.bankerSeat = jdata.s;
                            var t,
                                a = jdata.h,
                                i = jdata.e,
                                n = jdata.m,
                                s = jdata.n;
                            if (jdata.u)
                                (t = jdata.u);
                            this.desk.showLeftCardsNum(s);
                            GameData.players[0].state = PlayerState.DESK_PLAYING;
                            this.desk.showZhuangPic(GameData.bankerSeat);
                            GameData.gangCardNum = e.g - 1;
                            GameData.lzCard = jdata.l[0] || 0;
                            for (var r = 1; r < jdata.l.length; r++)
                                GameData.lzpCard[r - 1] = jdata.l[r] || 0;
                            this.desk.showHunCards(!0);
                            if (a) { 
                                GameData.recLastDapaiPlayer = GameData.players[i];
                                GameData.recOutCardValue = n;
                            }
                            if (null != t && t >= 0) 
                                GameData.lastDaPaiPlayer = GameData.players[t];
                            break;
                        case 103: // 可能是断线重连
                            for (var t in e)
                                if (e.hasOwnProperty(t)) {
                                    var a = e[t],
                                        i = a.s,
                                        n = GameData.players[i];
                                    this.desk.setUserBaohu(i, 1 == a.bh);
                                    var s = a.o;
                                    for (var r in s)
                                        if (s.hasOwnProperty(r)) {
                                            var o = s[r];
                                            n.moPai(o), n.daPai(o, 0, !1, !1)
                                        }
                                    var l = a.d;
                                    for (var h in l)
                                        if (l.hasOwnProperty(h)) {
                                            var d = l[h],
                                                u = d[0],
                                                o = d[2],
                                                c = new DaoPu,
                                                p = 0;
                                            switch (u) {
                                            case OperType.CHI:
                                                c.operType = u, p = 2;
                                                for (var g = 0; p > g; g++)
                                                    i == SeatType.BOT ? n.moPai(o[g]) : n.moPai(0);
                                                n.chidaoPuCards(o, c, n.dpInfos.length, new MJCard(d[3], n.dCardType)), n.dpInfos.push(c);
                                                break;
                                            case OperType.PENG:
                                                p = 3, c.operType = u;
                                                for (var g = 0; p > g; g++)
                                                    i == SeatType.BOT ? n.moPai(o) : n.moPai(0);
                                                n.daoPuCards(p, o, c, n.dpInfos.length), n.dpInfos.push(c);
                                                break;
                                            case OperType.KAI_GANG:
                                                if (0 == Tool.isHun(o)) {
                                                    c.operType = u, p = 4;
                                                    for (var g = 0; p > g; g++)
                                                        i == SeatType.BOT ? n.moPai(o) : n.moPai(0);
                                                    n.daoPuCards(p, o, c, n.dpInfos.length), n.dpInfos.push(c)
                                                } else {
                                                    var m = !1;
                                                    c.operType = u, i == SeatType.BOT ? n.moPai(o) : n.moPai(0);
                                                    for (var g = 0; g < n.lzdpInfos.length; g++) {
                                                        var T = n.lzdpInfos[g];
                                                        if ((255 & T.dpCards[0].value) == (255 & o)) {
                                                            n.LzdaoPuCards(o, T, g), m = !0;
                                                            break
                                                        }
                                                    }
                                                    m || (c.operType = OperType.KAI_GANG, n.lzdpInfos.push(c), n.LzdaoPuCards(o, c, n.lzdpInfos.length - 1))
                                                }
                                                break;
                                            case OperType.MING_GANG:
                                            case OperType.AN_GANG:
                                                c.operType = u, p = 4;
                                                for (var g = 0; p > g; g++)
                                                    i == SeatType.BOT ? n.moPai(o) : n.moPai(0);
                                                n.daoPuCards(p, o, c, n.dpInfos.length), n.dpInfos.push(c)
                                            }
                                        }
                                    if (i == SeatType.BOT) {
                                        var y = a.l;
                                        for (var r in y)
                                            if (y.hasOwnProperty(r)) {
                                                var o = y[r];
                                                n.moPai(o)
                                            }
                                    } else
                                        for (var v = a.l, g = 0; g < v.length; g++)
                                            n.moPai(0);
                                    n.sortHandCards(), n.showHandCards(), n.setHandHunBlink()
                                }
                            if (0 != GameData.recOutCardValue) {
                                if (GameData.recLastDapaiPlayer.seatType == SeatType.BOT)
                                    GameData.recLastDapaiPlayer.moPai(GameData.recOutCardValue);
                                else
                                    GameData.recLastDapaiPlayer.moPai(0);
                                GameData.recLastDapaiPlayer.daPai(GameData.recOutCardValue, 0, !1, !1);
                            }
                            if (GameData.lastDaPaiPlayer) 
                                this.desk.playFBAni(GameData.lastDaPaiPlayer.seatType);
                            else
                                this.desk.stopFBAni();
                            break;
                    }
                    break;
            }
        }
    },
});

//SocketManager.Ins = new SocketManager();
JsonSocket['Ins'] = new JsonSocket();
// Object.defineProperty(SocketManager, "Ins", {
//     get: function() {
//         return null == this._ins && (this._ins = new SocketManager), this._ins;
//     },
//     enumerable: !0,
//     configurable: !0
// });
