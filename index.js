const { readFileSync, readdirSync, existsSync, mkdirSync } = require('fs')

const { SerialPort } = require('serialport')

const feeder = require('./iontec_feeder_farrowing')

const dir = './sow_data/farrowing'
!existsSync(dir) && mkdirSync(dir)
let fileList = readdirSync(dir)

let sowInfo = [];
const getSowInfo = (filelist) => {
    // console.log(filelist)
    let i = 0
    let sowinfo
    while ( i < filelist.length) {
        filepath = dir + '/' + filelist[i]
        sowinfo = JSON.parse(readFileSync(filepath))
        sowInfo.push(sowinfo)
        i++
    }
    // console.log(sowInfo)
}
getSowInfo(fileList)

const iFeeders = []
const getClass = (sowInfo) => {
    // console.log(sowInfo.length)
    let i = 0
    while ( i < sowInfo.length) {
        iFeeders[i] = new feeder(sowInfo[i], '/queue')
        i++
    }
     console.log(iFeeders)
}
getClass(sowInfo)

const sp = new SerialPort({ path:'COM5', baudRate: 115200, dataBits : 8, stopBits : 1, parity : 'none', autoOpen: true})

let cachedData = null
const cached_data = (data) => {
    const length = data.length
    if (data[0] == 240 && data[length - 1] == 241) return data
    else if (data[0] == 240 && data[length - 1] != 241) cachedData = data
    else if (data[0] != 240 && data[length - 1] == 241) return Buffer.concat([cachedData, data])
    else return (cachedData = null)
}

let select_feeder
sp.on('data', data => {
     //console.log(data)
    const rx_data = cached_data(data)
    if (rx_data != null) {
        let pd = select_feeder.parser(rx_data)
       console.log(pd)
        cachedData = null
    }
})

const serialWrite = async (serialData) => {
    console.log(serialData)
    sp.write(serialData, err=> {
        if(err) return console.log(err)
    })
    return;
}

const reqType = async (reqCode) => {
    switch (reqCode) {
        case 'getFeedInfo':                             // 급이 정보 요청
            await serialWrite(await select_feeder.getFeedInfo())
            return;
        case 'predicterFarrowingDayInfo':               // 분만 예정일 정보      
            await serialWrite(await select_feeder.predictedFarrowingDayInfo())
            return;
        case 'feedingProfileInfo':                      // 급이 테이블 
            await serialWrite(await select_feeder.feedingProfileInfo())
            return;
        // case 'upgradeInfo':                             // 원격 업그레이드 정보, 헤더만 전송하면 장치가 리셋함.
        //     await serialWrite(await select_feeder.upgradeInfo())
        //     return;
        case 'waterInfo':
            await serialWrite(await select_feeder.waterInfo())
            return;
        case 'waterProfileInfo':                      // 컨트롤러 정보 전체 리셋
            await serialWrite(await select_feeder.waterProfileInfo())
            return;
        case 'deviceSetupInfo':                         // 장치 설정 정보
            await serialWrite(await select_feeder.deviceSetupInfo())
            return;
        // case 'feedingOnTimePerOnceInfo':                // 1회 급이시간 정보
        //     await serialWrite(await select_feeder.feedingOnTimePerOnceInfo())
        //     return;
        case 'dateTimeInfo':                            // 시간정보
            await serialWrite(await select_feeder.dateTimeInfo())
            return;
        case 'deviceSetupInfo2':                        // 장치 설정 정보 2
            await serialWrite(await select_feeder.deviceSetupInfo2())
            return;
        // case 'xbeeChannelChange':                       // 시간 정보? 지그비 채널 변경
        //     await serialWrite(await select_feeder.xbeeChannelChange())
        //     return;
        default:
            break;
    }
}

const delay = async (ms) => {    
    await new Promise(res => setTimeout(() => {
    //   console.log(`${ms} 밀리초가 지났습니다.`);
      res()
    }, ms));
}

const init = async () => {
    // select_feeder = iFeeders[0]

    // for (let i = 0; i < 5; i++) {
    //     await reqType('feedingProfileInfo')             // 3초 이상 간격으로 5번 전송 응답이 없을 경우 급이기 확인 필요
    //     await delay(5000)
    // }

    // for (let i = 0; i < 5; i++) {
    //     await reqType('waterProfileInfo')               // 3초 이상 간격으로 5번 전송, 응답이 없을 경우 급이기 확인 필요
    //     await delay(5000)
    // }
    
    for await (const iFeeder of iFeeders) {
        select_feeder = iFeeder
        await reqType('deviceSetupInfo')
        await delay(10000)
        await reqType('getFeedInfo')
        await delay(10000)
    }
}
init()

// const init_loop = async () => {
//     while(1) {
//         for await (const iFeeder of iFeeders) {
//             select_feeder = iFeeder
//             await reqType('getFeedInfo')
//             await delay(10000)
//             await reqType('predicterFarrowingDayInfo')
//             await delay(10000)
//             await reqType('feedingProfileInfo')
//             await delay(10000)
//             await reqType('waterInfo')
//             await delay(10000)
//             await reqType('waterProfileInfo')
//             await delay(10000)
//             await reqType('deviceSetupInfo')
//             await delay(10000)
//             await reqType('dateTimeInfo')
//             await delay(10000)
//             await reqType('deviceSetupInfo2')
//             await delay(10000)
//         }
//     }
// }
// init_loop()
