// Same north-to-south order as the policy map (map.js REGIONS).
const CITY_ORDER=['臺北市','新北市','基隆市','桃園市','新竹市','新竹縣','宜蘭縣','苗栗縣','臺中市','彰化縣','南投縣','雲林縣','嘉義市','嘉義縣','臺南市','高雄市','屏東縣','花蓮縣','臺東縣','澎湖縣','金門縣','連江縣'];
const cityRank=city=>{const index=CITY_ORDER.indexOf(city);return index===-1?CITY_ORDER.length:index};
