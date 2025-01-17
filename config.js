exports.redis = {
    centralRedisHost: process.env.CENTRAL_REDIS_HOST || "localhost"
}

exports.certbot = {
    dryrun: process.env.CERTBOT_DRYRUN || false,
    dryrun: process.env.CERTBOT_STAGING || false
}

exports.loglevel = process.env.LOG_LEVEL || "debug"