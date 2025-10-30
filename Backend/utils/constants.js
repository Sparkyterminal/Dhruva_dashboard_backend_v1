const entitiesList = [
    'DISTRICT',
    'AVATAR',
    'SUBJECT',
    'HOSPITAL'
];

const activityTypes = ['LOGGED_IN', 'LOGGED_OUT', 'CREATED', 'MODIFIED', 'ACTIVATED', 'DEACTIVATED', 'ARCHIVED'];

const childActivityTypes = ['RECEIVED', 'SENT_BACK', 'PROCESSED', 'APPROVED', 'REJECTED', 'ON_HOLD'];

const fileUnits = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

const maxFileSelection = 10;

const fileTypeLimits = {
    image: 5,
    audio: 10,
    video: 50,
    document: 25
}

const allowedFileTypes = [
    {
        type: "image",
        mimetype: "image/gif",
        extension: [".gif"],
        max_upload_size: fileTypeLimits.image
    },
    {
        type: "image",
        mimetype: "image/jpeg",
        extension: [".jpg", ".jpeg"],
        max_upload_size: fileTypeLimits.image
    }, 
    {
        type: "image",
        mimetype: "image/png",
        extension: [".png"],
        max_upload_size: fileTypeLimits.image
    }, 
    {
        type: "image",
        mimetype: "image/webp",
        extension: [".webp"],
        max_upload_size: fileTypeLimits.image
    }, 
    {
        type: "audio",
        mimetype: "audio/wave",
        extension: [".wav"],
        max_upload_size: fileTypeLimits.audio
    },
    {
        type: "audio",
        mimetype: "audio/wav",
        extension: [".wav"],
        max_upload_size: fileTypeLimits.audio
    },
    {
        type: "audio",
        mimetype: "audio/x-wav",
        extension: [".xwav"],
        max_upload_size: fileTypeLimits.audio
    },
    {
        type: "audio",
        mimetype: "audio/mpeg",
        extension: [".mp3"],
        max_upload_size: fileTypeLimits.audio
    }, 
    {
        type: "video",
        mimetype: "video/mp4",
        extension: [".mp4"],
        max_upload_size: fileTypeLimits.video
    }, 
    {
        type: "video",
        mimetype: "video/x-m4v",
        extension: [".m4v"],
        max_upload_size: fileTypeLimits.video
    },
    {
        type: "video",
        mimetype: "video/quicktime",
        extension: [".mov"],
        max_upload_size: fileTypeLimits.video
    },
    {
        type: "video",
        mimetype: "video/webm",
        extension: [".webm"],
        max_upload_size: fileTypeLimits.video
    },
    {
        type: "video",
        mimetype: "video/x-msvideo",
        extension: [".avi"],
        max_upload_size: fileTypeLimits.video
    },
    {
        type: "video",
        mimetype: "video/mpeg",
        extension: [".mpeg"],
        max_upload_size: fileTypeLimits.video
    },
    {
        type: "document",
        mimetype: "application/pdf",
        extension: [".pdf"],
        max_upload_size: fileTypeLimits.document
    },
    {
        type: "document",
        mimetype: "text/csv",
        extension: [".csv"],
        max_upload_size: fileTypeLimits.document
    },
    {
        type: "document",
        mimetype: "application/msword",
        extension: [".doc"],
        max_upload_size: fileTypeLimits.document
    },
    {
        type: "document",
        mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        extension: [".docx"],
        max_upload_size: fileTypeLimits.document
    },
    {
        type: "document",
        mimetype: "vnd.ms-powerpoint",
        extension: [".ppt", ".pps"],
        max_upload_size: fileTypeLimits.document
    },
    {
        type: "document",
        mimetype: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        extension: [".pptx"],
        max_upload_size: fileTypeLimits.document
    },
    {
        type: "document",
        mimetype: "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
        extension: [".ppsx"],
        max_upload_size: fileTypeLimits.document
    },
    {
        type: "document",
        mimetype: "application/vnd.ms-excel",
        extension: [".xls"],
        max_upload_size: fileTypeLimits.document
    },
    {
        type: "document",
        mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        extension: [".xlsx"],
        max_upload_size: fileTypeLimits.document
    },
];

const hostelSubParticular = [
    {
        id:1,
        ka:'ಪರಿವೀಕ್ಷಣೆ ನಡೆಸಿದ ಅಧಿಕಾರಿ ಹೆಸರು ಮತ್ತು ಹುದ್ದೆ',
        en:'Name and designation of the officer who conducted the inspection'
    },
    {
        id:2,
        ka:'ಭೇಟಿ ನೀಡಿದ ವಸತಿ ನಿಲಯ ಹೆಸರು, ಸ್ಥಳ ಮತ್ತು ವರ್ಗ ಮಂಜೂರಾದ ವರ್ಷ',
        en:'Name of Hostel visited, Location and Category, Year sanctioned'
    },
    {
        id:3,
        ka:'ವಸತಿ ನಿಲಯದ ಮೇಲ್ವಿಚಾರಕರ ಹೆಸರು, ಹುದ್ದೆ (ಪಾಯಂ/ಪ್ರಭಾರ) ಹಾಗು ದೂರವಾಣಿ ಸಂಖ್ಯೆ',
        en:'Hostel Supervisor Name, Designation (Permanent/Incharge) and Telephone Number'
    },
    {
        id:4,
        ka:'ಬಾಡಿಗೆ ಕಟ್ಟಡ/ಸ್ವಂತ ಕಟ್ಟಡ (ಬಾಡಿಗೆ ಕಟ್ಟಡದಲ್ಲಿ ಇದ್ದರೆ ಸರ್ಕಾರಿ ಜಮೀನು/ನಿವೇಶನ ಮಂಜೂರಾತಿಗಾಗಿ ಕೈಗೊಂಡಿರುವ ಕ್ರಮಗಳು)',
        en:'Rented Building/Own Building (If rented, Procedures taken for sanctioning of Government land/plot)'
    },
    {
        id:5,
        ka:'ಮಂಜೂರಾದ ವಿದ್ಯಾರ್ಥಿಗಳ ಸಂಖ್ಯೆಯ ವಿವರ ಮತ್ತು ವಾಸ್ತವ್ಯವಿರುವ ವಿದ್ಯಾರ್ಥಿಗಳ ವಿವರ (ಎಸ್.ಸಿ/ಎಸ್.ಟಿ/ಓ.ಬಿ.ಸಿ/ಇತರೆ)',
        en:'Details of number of students sanctioned and details of students with accommodation (SC/ST/OBC/Other)'
    },{
        id:6,
        ka:'ಹೊರಗಿನ ವ್ಯಕ್ತಿಗಳು ಉಳಿದುಕೊಂಡಿರುವ ಬಗ್ಗೆ',
        en:'Details of outsiders resided'
    },{
        id:7,
        ka:'ಕಡ್ಡಾಯವಾಗಿ ಒದಗಿಸಬೇಕಾಗಿರುವ ಮೂಲಭೂತ ಸೌಕರ್ಯಗಳ ವಿವರ (ಕಾಟ್, ಬೆಡ್, ತಲೆದಿಂಬು, ಬೆಡ್ ಶೀಟ್, ರಗ್ಗು ಮತ್ತು ಇತ್ಯಾದಿ ಕೊರತೆ ಇದ್ದಲ್ಲಿ ಸಂಪೂರ್ಣ ವಿವರ',
        en:'Details of basic amenities to be provided compulsorily (Cot, bed, pillow, bed sheet, rug etc. complete details in case of shortage)'
    },{
        id:8,
        ka:'ವಸತಿ ನಿಲಯದ ಮಕ್ಕಳಿಗೆ ವಿಶೇಷ ತರಗತಿಗಳನ್ನು ಹಮ್ಮಿಕೊಂಡಿರುವ ವಿವರ',
        en:'Details of special classes held for hostel students'
    },{
        id:9,
        ka:'ಗ್ರಂಥಾಲಯದ ಲಭ್ಯತೆಯ ವಿವರ',
        en:'Availability of Library details'
    },{
        id:10,
        ka:'ಬಿಸಿ ನೀರಿನ ಸೌಲಭ್ಯದ ವಿವರ ಹಾಗೂ ಸೋಲಾರ ಸೌಲಭ್ಯದ ಲಭ್ಯತೆಯ ವಿವರ',
        en:'Details of hot water facility and availability of solar facility'
    },{
        id:11,
        ka:'ಅಡುಗೆ ತಯಾರಿಸುವ ಕೊಠಡಿಯ ಸ್ವಚ್ಛತೆ, ಅವಶ್ಯಕ ಸಾಮಾಗ್ರಿಗಳ ವಿವರ ಕೊರತೆ ಇದ್ದಲ್ಲಿ ಅಂತಹ ಸಾಮಾಗ್ರಿಗಳ ವಿವರ',
        en:'Cleanliness of kitchen, details of necessary materials, in case of shortage of such materials'
    },{
        id:12,
        ka:'ಆಹಾರದ ಗುಣಮಟ್ಟ ಮತ್ತು ಮೆನು ಕಾರ್ಡ್',
        en:'Quality of food and menu card'
    },{
        id:13,
        ka:'ಸ್ಟೋರ್ ನಿರ್ವಹಣೆ ಮತ್ತು ಸ್ಟಾಕ್ ರಿಜಿಸ್ಟರ್',
        en:'Store management and stock register'
    },{
        id:14,
        ka:'ಕುಡಿಯುವ ನೀರಿನ ಮೂಲದ ವಿವರ, ಸಂಗ್ರಹಾರಗಳನ್ನು ಸ್ವಚ್ಛಗೊಳಿಸಿದ ವಿವರ',
        en:'Details of source of drinking water, details of cleaning of reservoirs'
    },{
        id:15,
        ka:'ವಿವಿಧ ರೀತಿಯ ಕಿಟ್ ವಿತರಣೆಯ ಕುರಿತು ಮಹಿತಿ',
        en:'Information on different types of kit distributed'
    },{
        id:16,
        ka:'ವಸತಿ ನಿಲಯದಲ್ಲಿ ಲಭ್ಯವಿರುವ ತುರ್ತು ಚಿಕಿತ್ಸಾ ಸಲಕರಣೆಗಳು ಹಾಗೂ ಔಷಧಿಗಳ ವಿವರ ಹಾಗೂ ಲಭ್ಯವಿರುವ ಫಸ್ಟ್-ಎಡ್ ಸಲಕರಣೆಗಳ ವಿವರ',
        en:'Details of emergency equipment and medicines available in the hostel and details of first-aid materials available'
    },{
        id:17,
        ka:'ವಸತಿ ನಿಲಯದ ಮಕ್ಕಳ ಮಾಸಿಕ ಆರೋಗ್ಯ ತಪಾಸಣೆಯ ವಿವರ, ಗಂಭೀರ ಕಾಯಿಲೆಗಳು ಗುರುತಿಸಿದ್ದಲ್ಲಿ ಕೈಗೊಂಡಿರುವ ಕ್ರಮಗಳು',
        en:'Details of monthly health check-up of hostel students, measures taken if serious diseases are detected'
    },{
        id:18,
        ka:'ಕ್ರೀಡಾ ಮೈದಾನದ ಸಲಕರಣೆಗಳ ಮತ್ತು ವ್ಯಾಯಾಮ ಸಲಕರಣೆಗಳ ಲಭ್ಯತೆ ವಿತರಣೆ ಇತ್ಯಾದಿ.',
        en:'Availability and distribution of sports ground materials and exercise materials etc'
    },{
        id:19,
        ka:'ವಸತಿ ವಿದ್ಯಾರ್ಥಿಗಳಿಗೆ ಅನುಗುಣವಾಗಿ ಅವಶ್ಯಕವಿರುವ ಶೌಚಾಲಯಗಳ ಸಂಖ್ಯೆ, ಲಭ್ಯತೆ, ಕೊರತೆ ಹಾಗೂ ಕೈಗೊಳ್ಳಲಾಗುತ್ತಿರುವ ಸ್ವಚ್ಛತೆ ಕುರಿತು ಸಂಪೂರ್ಣ ವಿವರ',
        en:'Complete details of number of toilets, its availability and shortage. Action taken for cleanliness of toilets.'
    },{
        id:20,
        ka:'ವಸತಿ ನಿಲಯದ ಅಂತಿಮ ಶ್ರೇಣಿ ತರಗತಿಯಲ್ಲಿನ ಕಳೆದ 3 ವರ್ಷದ ಫಲಿತಾಂಶದ ವಿವರ',
        en:'Last 3 years result details of hostel final grade classes'
    },
    {
        id:21,
        ka:'ಸಿ.ಸಿ.ಟಿವಿಗಳ, ಬಯೋಮೆಟ್ರಿಕ್ ಹಾಜರಾತಿ ಸಾಧನಗಳ ಹಾಗೂ ಸುರಕ್ಷತಾ ಕ್ರಮಗಳು ಅಳವಡಿಕೆ ',
        en:'Installation of CCTVs, biometric attendance devices and security measures.'
    },{
        id:22,
        ka:'ಮಕ್ಕಳ ಜೊತೆ ಸಂವಾದದ ಸಾರಂಶ',
        en:'Summary of interactions with students'
    },{
        id:23,
        ka:'23  ವಸತಿ ನಿಲಯದ ಪರಿವೀಕ್ಷಣೆಯ ಸಮಯದಲ್ಲಿ ಕಂಡು ಬಂದಿರುವ ನ್ಯೂನ್ಯತೆಗಳ',
        en:'Issues found during inspection of the hostel'
    },{
        id:24,
        ka:'ಶಿಫಾರಸ್ಸುಗಳು ಮತ್ತು ಇತರೆ ವಿಷಯಗಳು ಯಾವುದಾದರು ಇದ್ದಲ್ಲಿ',
        en:'Recommendations and other matters if any'
    },{
        id:25,
        ka:'ಭೇಟಿ ನೀಡಿದ ಸಮಯದಲ್ಲಿ ತೆಗೆಯಲಾದ ಭಾವಚಿತ್ರಗಳು',
        en:'Photographs taken during the visit'
    }
]



module.exports = {
    entitiesList,
    activityTypes,
    childActivityTypes,
    allowedFileTypes,
    fileUnits,
    maxFileSelection,
    hostelSubParticular
}