/**
 * 아이온텍 임신사 급이기 BFC700, BPC100
 */

const { JsonDB, Config } = require('node-json-db')
const { readFileSync, unlinkSync, existsSync, mkdirSync } = require('fs')

const BPC100 = {
    GET_FEED_INFO: 0,                   // 실시간 급이 정보
    PREDICTED_FARROWING_DAY_INFO: 1,    // 분만 예정일 정보
    FEEDING_PROFILE_INFO: 2,            // 급이 테이블 정보
    DEVICE_SETUP_INFO: 7,               // 설정 정보
    DATE_TIME_INFO: 9,                  // 시간 정보
};
Object.freeze(BPC100);

class iontec_feeder_pregnant {
    constructor (sowInfo, dbBaseDir) {
        this.sowInfo = sowInfo
        this.dbBaseDir = dbBaseDir
        this.dbPath = '.' + this.dbBaseDir + '/' + sowInfo.stall.gwid + '-' + sowInfo.stall.id
        // console.log(this.dbBaseDir, this.dbPath)

        !existsSync('.' + this.dbBaseDir) && mkdirSync('.' + this.dbBaseDir)

        try {
            const file = readFileSync(this.dbPath + '.json')
            if (!file) {
                unlinkSync(this.dbPath + '.json')
            }
        } catch (e) {}

        const db = new JsonDB(new Config(this.dbPath, true, false, '/'))
        this.queue = []

        try {
            _ = async () => {this.queue = db.getData(this.dbBaseDir)}
        } catch (e) { }

        this.pushQueue = async (data) => {
            this.queue.push(data)
            db.push(this.dbBaseDir, this.queue)
        }
        this.deleteQueue = async (index) => {
            this.queue.splice(index ?? 0, 1)
            db.push(this.dbBaseDir, this.queue)
        }
    }

    parser(d) {
        const int8d = new Int8Array(d)
        const length = d.length
        let res
        if(d[0] == 0xF0 && d[length -1] == 0xF1) {
            const cs = (d.reduce((sum, e) => {return sum + e},0) - d[0] - d[length-1] - d[length-2]) % 256
            if(cs  == d[length - 2]) {
                switch(d[4]) {
                    case 0:                                 //실시간급이 정보 GET_FEED_INFO
                        res = {
                            reqCode: 'getFeedInfo',
                            header : d.slice(1,8),
                            motorOverload: d[7] & 0x08,     // 모터 부하
                            isRtcFalse: d[7] & 0x04,        // RTC 상태
                            isWeaning: d[7] & 0x02,         // 이유
                            isFasting: d[7] & 0x01,         // 절식
                            increasing: int8d[8]/10,        // 증감량
                            age: int8d[9],                  // 분만후 경과일수 128이상이면 -256  ex) 250 = 250-256 = -6일차
                            setting: d[10]/10,              // 설정량 3.2kg  ex) 32 = 32/10 3.2kg
                            eating: d[11]/10,               // 섭취량 3.2kg  ex) 32 = 32/10 3.2kg
                            remaining: d[12]/10,            // 잔량 3.2kg  ex) 32 = 32/10 3.2kg 
                            eatings: d.slice(13, 18).map((value) => value / 10),       // 1 ~ 5 타임 섭취량 3.2kg  ex) 32 = 32/10 3.2kg
                            useWater: d[18],                // 음수 사용 여부 1:사용 2:사용안함
                            feedingCount: d[19],            // 컨트롤러에 적용된 급이횟수
                            feedingTimes : d.slice(20, 25), // 컨트롤러에 적용된 급이시간 1 ~ 5 급이 시간 081 = 08시 10분
                            touchFilter: d[25],             // 컨트롤러에 적용된 터치딜레이 타임 단위:초
                            waterOnTimePerOnce: d[26] > 100 ? (d[26] - 100) / 10 : d[26],      // 1회 음수량 단위:초 103,106= 0.3초,0.6초
                            directWaterOnTime: d[27],       // 음수 직수량 단위:초 
                            feedingProfileType: d[28],      // 급이 유형/프로파일
                            feedingAmtPerOnce: d[29],       // 1회 급이량 1이면 100g
                            motorLimitTime: d[30],          // 100g에 해당하는 모터 동작 시간 - 사용안함 
                            touchCnt: d[31],                // 터치센서 카운트(매일 0시 리셋)
                            motorError: d[32] & 0x03,       // 모터(1), 터치(2) 에러
                            elapsedDayFromInTime: int8d[33],    // 이유 해제 후 일차
                            standingCount: d[34],                         // 기립횟수
                            waitingWaterAfterEating: d[35],     // 섭취 후 음수 대기 시간(분)
                            directWaterOnTimeAfterEating: d[36],    // 섭취 후 음수 시간(초)
                            learningMode: d[37] & 0x01,                    // 0:일반모드, 1:학습모드
                            learningDelay: ((d[37] & 0xF0) >> 4) * 10,      // 학습딜레이 
                            waterType: d[38],                       // 음수 유형
                            waterOfToday: d[39],                    // 음수유형이 적용되있을때 설정된 음수량 / 10 L
                            motorDelay: d[40],                      // 모터 딜레이 (초)
                            touchPerHour: d[41],                    // 시간당 터치
                            cal: d[42],                             // 사료 Cal (g)
                            forewradReverseCount: d[43],            // 정역 카운트  사용안함
                            motorCurrentLimit: d[44],               // 모터 전류 제한  사용안함
                            menuFlag: d[45] & 0x03,                        // 메뉴 버튼 클릭 플래그(0x01), 급이 음수 적용 플래그(0x02) 30분간 플래그 지속
                            sowCode: d.toString('ascii', 46, 56).replace(/[^\x20-\x7E]/g, ''),  // 모돈 번호
                            isBeepForTouching: d[56],               // 0: 터치시 비프끄기 , 1: 터치시 비프켜기
                        }
                        this.pushQueue(res)
                        return res
                    case 1:  //분만예정일 정보 PREDICTED_FARROWING_DAY_INFO
                        res = {
                            reqCode: 'predicterFarrowingDayInfo',
                            header : d.slice(1,8)
                        }
                        this.pushQueue(res)
                        return res
                    case 2:  //급이테이블 정보, /10을 해서 사용할 것 FEEDING_PROFILE_INFO 응답없음
                        res = {
                            reqCode: 'feedingProfileInfo',
                            header : d.slice(1,8)
                        }
                        this.pushQueue(res)
                        return res
                    case 7:  //설정 정보 DEVICE_SETUP_INFO
                        res = {
                            reqCode: 'deviceSetupInfo',
                            header : d.slice(1,8),
                            cal: d[7],
                            useWater: d[8],                         // 1:사용, 2: 사용안함
                            feedingTimesPerDay : d[9],              // 급이회수(2회,3회,4회,5회)
                            feedTimings : d.slice(10, 15),          // 앞에두자리 시간, 뒤에 두자리 분중에서 마지막 0은 삭제하고 보내기
                            touchFilter: d[15],                     // 터치와 터치사이의 딜레이 시간(초)
                            waterOnTimePerOnce: d[16] > 100 ? (d[16] - 100) / 10 : d[16],              // 1회 급이시 나오는 음수량(초)
                            directWaterOnTime: d[17],               // 음수직수시 음수량(초)
                            feedingAmtPerOnce: d[18],               // 3이면 300g
                            waitingWaterAfterEating: d[19],         
                            directWaterOnTimeAfterEating: d[20],
                            feedingRates: d.slice(21, 26),
                            fastingTime: d[26],
                            elapsedDayFromInTime: int8d[27],
                            led: d[28],                             // 사용 안함
                            motorCurrentLimit: d[29],               // 사용 안함
                            motorDelay: d[30],
                            feedingValidTime: d.slice(31, 36),
                            isCarryOver: d[36],
                            isBeepForTouching: d[37]
                        }
                        this.pushQueue(res)
                        return res
                    case 9:  //시간 정보 DATE_TIME_INFO 응답없음
                        res = {
                            reqCode: 'dateTimeInfo',
                            header : d.slice(1,8)
                        }
                        this.pushQueue(res)
                        return res
                    default: break;
                }
            }
        }
    }

    getFeedInfo = async () =>  {
        console.log('GET_FEED_INFO: reqCode = 0', 'room =', this.sowInfo.stall.gwid, 'stall =', this.sowInfo.stall.id)

        const { GET_FEED_INFO } = BPC100
        const { stall } = this.sowInfo

        const header = {
            dir: 1,                     // 급이기로 전송
            kinds: 9,                   // 임신사 급이기
            id: stall.id,               // 현재 급이기 ID
            reqType: GET_FEED_INFO,     // 실시간 급이 정보 요청
            ver: 1,                     // fw ver
            gwid: stall.gwid,           // 게이트웨이 ID, 모를 땐 0
            startAdde: 0,
        }

        let packet = {
            stx: 240,
            buf : [...Object.values(header)],
            cs: 0,
            etx: 241
        }
        packet.cs = packet.buf.reduce((sum, e) => { return sum + e }, 0) % 256

        const wbuf = Buffer.from(Object.values([packet.stx, ...packet.buf, packet.cs, packet.etx]))

        return wbuf
    }

    predictedFarrowingDayInfo = async () => {           // 분만 예정일 정보
        console.log('PREDICTED_FARROWING_DAY_INFO: reqCode = 1', 'room =', this.sowInfo.stall.gwid, 'stall =', this.sowInfo.stall.id)

        const { PREDICTED_FARROWING_DAY_INFO } = BPC100
        const { 
            stall,
            dDay,
            feedingProfileType,
            fasting,
            sowCode,
            learningMode,
            learningDelay,
            incdec
        } = this.sowInfo

        const header = {
            dir: 1,                                     // 급이기로 전송
            kinds: 9,                                   // 임신사 급이기
            id: stall.id,                               // 현재 급이기 ID
            reqType: PREDICTED_FARROWING_DAY_INFO,      // 분만 예정일 정보
            ver: 1,                                     // fw ver
            gwid: stall.gwid,                           // 게이트웨이 ID, 모를 땐 0
            incdec: incdec,                             // 실제 적용되는 값. 증감량: (incdec - 120)* 100, unit: 100g
        }

        let buf = new Array(10).fill(0)
        const codes = Buffer.from(sowCode).reverse()
        for(let i = 0 ; i < codes.length ; i++) {
            buf[i] = codes[i]
        }

        const payload = [
            parseInt((new Date().getTime() - new Date(dDay).getTime()) / (1000*60*60*24)), // -29~28 오늘날짜와 분만일 기준으로 datediff로 계산한 정수값을 전송 
            feedingProfileType,                                 // 1~5(3이 기준유형)
            fasting,                                            // 00000001:절식/ 0b11111100 >> 2 : 절식기간   /00000010:이유 
            ...Object.values(buf.reverse()),
            ((learningDelay / 10) << 4) + learningMode,         // bit(7,6,5,4 : 학습딜레이, 0:학습모드<0:일반모드, 1:학습모드>)  단위:10초 0001 0000 = 10초
            ...Object.values(new Array(9).fill(0))
        ]

        let packet = {
            stx: 240,
            buf : [...Object.values(header), ... Object.values(payload)],
            cs: 0,
            etx: 241
        }

        packet.cs = packet.buf.reduce((sum, e) => { return sum + e }, 0) % 256

        const wbuf = Buffer.from(Object.values([packet.stx, ...packet.buf, packet.cs, packet.etx]))
        // console.log(wbuf)
        return wbuf
    }

    feedingProfileInfo = async () => {      // 급이테이블 정보
        console.log('FEEDING_PROFILE_INFO: reqCode = 2', 'room =', this.sowInfo.stall.gwid, 'stall =', this.sowInfo.stall.id)

        const { FEEDING_PROFILE_INFO } = BPC100

        const { 
            stall,
            feedingProfile,
        } = this.sowInfo

        const header = {
            dir: 1,                                     // 급이기로 전송
            kinds: 9,                                   // 임신사 급이기
            id: stall.id,                               // 현재 급이기 ID
            reqType: FEEDING_PROFILE_INFO,              // 급이테이블 정보
            ver: 66,                                     // fw ver
            gwid: stall.gwid,                           // 게이트웨이 ID, 모를 땐 0
            tag: 222,                                   // 전송할 태그의 순번(0~n)
        }

        const payload = [
            feedingProfile[0].type,
            ...Object.values(feedingProfile[0].feedings),
            feedingProfile[1].type,
            ...Object.values(feedingProfile[1].feedings),
            feedingProfile[2].type,
            ...Object.values(feedingProfile[2].feedings),
            feedingProfile[3].type,
            ...Object.values(feedingProfile[3].feedings),
            feedingProfile[4].type,
            ...Object.values(feedingProfile[4].feedings),
            ...Object.values(new Array(90).fill(0))
        ]

        let packet = {
            stx: 240,
            buf : [...Object.values(header), ... Object.values(payload)],
            cs: 0,
            etx: 241
        }

        packet.cs = packet.buf.reduce((sum, e) => { return sum + e }, 0) % 256

        const wbuf = Buffer.from(Object.values([packet.stx, ...packet.buf, packet.cs, packet.etx]))
        // console.log(wbuf)
        return wbuf
    }

    deviceSetupInfo = async () => {         // 설정 정보
        console.log('DEVICE_SETUP_INFO: reqCode = 7', 'room =', this.sowInfo.stall.gwid, 'stall =', this.sowInfo.stall.id)

        const { DEVICE_SETUP_INFO } = BPC100

        const {
            stall,
            cal,
            useWater,
            feedingTimesPerDay,
            feedTimings,
            touchFilter,
            waterOnTimePerOnce,
            directWaterOnTime,
            feedingAmtPerOnce,
            waitingWaterAfterEating,
            directWaterOnTimeAfterEating,
            feedingRates,
            fastingTime,
            elapsedDayFromInTime,
            led,
            motorCurrentLimit,
            motorDelay,
            feedingValidTimes,
            isCarryOver,
            isBeepForTouching,
        } = this.sowInfo

        const header = {
            dir: 1,                                     // 급이기로 전송
            kinds: 9,                                   // 임신사 급이기
            id: stall.id,                               // 현재 급이기 ID
            reqType: DEVICE_SETUP_INFO,                 // 설정 정보
            ver: 1,                                     // fw ver
            gwid: stall.gwid,                           // 게이트웨이 ID, 모를 땐 0
            cal: cal,                                        // 100g 해당하는 실제 사료투하량
        }

        const payload = [
            useWater,
            feedingTimesPerDay,
            ...Object.values(feedTimings),
            touchFilter,
            waterOnTimePerOnce % 1 ? waterOnTimePerOnce * 10 + 100 : waterOnTimePerOnce,
            directWaterOnTime,
            feedingAmtPerOnce,
            waitingWaterAfterEating,
            directWaterOnTimeAfterEating,
            ...Object.values(feedingRates),
            fastingTime,
            elapsedDayFromInTime,
            led,
            motorCurrentLimit,
            motorDelay,
            ...Object.values(feedingValidTimes),
            isCarryOver,
            isBeepForTouching,
            ...Object.values(new Array(21).fill(0))
        ]

        let packet = {
            stx: 240,
            buf : [...Object.values(header), ... Object.values(payload)],
            cs: 0,
            etx: 241
        }

        packet.cs = packet.buf.reduce((sum, e) => { return sum + e }, 0) % 256

        const wbuf = Buffer.from(Object.values([packet.stx, ...packet.buf, packet.cs, packet.etx]))
        // console.log(wbuf)
        return wbuf
    }

    dateTimeInfo = async () => {        // 시간정보
        console.log('DATE_TIME_INFO: reqCode = 9', 'room =', this.sowInfo.stall.gwid, 'stall =', this.sowInfo.stall.id)

        const { DATE_TIME_INFO } = BPC100
        const { stall } = this.sowInfo

        const header = {
            dir: 1,                                     // 급이기로 전송
            kinds: 9,                                   // 임신사 급이기
            id: stall.id,                               // 현재 급이기 ID
            reqType: DATE_TIME_INFO,                    // 시간정보
            ver: 1,                                     // fw ver
            gwid: stall.gwid,                           // 게이트웨이 ID, 모를 땐 0
            res: 0,                                     // 예비
        }

        const dateTime = new Date();
        const payload = [
            parseInt((dateTime.getFullYear() % 100) / 10) * 16 + dateTime.getFullYear() % 10,
            parseInt((dateTime.getMonth()+1) / 10) * 16 + (dateTime.getMonth()+1) % 10,
            parseInt(dateTime.getDate() / 10) * 16 + dateTime.getDate() % 10,
            parseInt(dateTime.getHours() / 10) * 16 + dateTime.getHours() % 10,
            parseInt(dateTime.getMinutes() / 10) * 16 + dateTime.getMinutes() % 10,
            parseInt(dateTime.getMinutes() / 10) * 16 + dateTime.getMinutes() % 10,
        ]
        
        let packet = {
            stx: 240,
            buf : [...Object.values(header), ... Object.values(payload)],
            cs: 0,
            etx: 241
        }

        packet.cs = packet.buf.reduce((sum, e) => { return sum + e }, 0) % 256

        const wbuf = Buffer.from(Object.values([packet.stx, ...packet.buf, packet.cs, packet.etx]))
        // console.log(wbuf)
        return wbuf
    }
}

module.exports = iontec_feeder_pregnant