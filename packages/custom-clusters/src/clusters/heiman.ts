/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { attribute, cluster, uint8, writable, command, uint16, field } from "@matter/main/model";

/**
 * Input to the {@link HeimanCluster.mutingSensor} command.
 */
class MutingSensorCommand {
    @field(uint16)
    mutingTime!: number;
}

/**
 * Input to the {@link HeimanCluster.sirenActivate} command.
 * sirenType: 0(default) 1(smoke siren) 2(co siren) 3(gas siren) 4(doorbell) 5(heat alarm siren)
 * volume: 0 ~ 100 (some of models may not support volume setting, but the device will ignore this para)
 * duration: 0(stop the siren) 1 ~ 0xfffe(specific duration) 0xffff(forever)
 */
class SirenActivateCommand {
    @field(uint8)
    sirenType!: number;
    @field(uint8)
    volume!: number;
    @field(uint16)
    duration!: number;
}


@cluster(0x120bfc01)
export class HeimanCluster {
    @attribute(0x0010, uint8)
    tamperAlarm?: number;

    @attribute(0x0011, uint8)
    preheatingState?: number;

    @attribute(0x0012, uint8)
    noDisturbingState?: number;

    @attribute(0x0013, uint8)
    sensorType?: number;

    @attribute(0x0014, uint8, writable)
    sirenActive?: number;

    @attribute(0x0015, uint8, writable)
    alarmMute?: number;

    @attribute(0x0016, uint8, writable)
    lowPowerMode?: number;

    @attribute(0x1004, uint8, writable)
    indicatorEnable?: number;

    /**
     * This command is used for muting sensor for a specific period if there is an alarm, like a fire alarm.
     */
    @command(0x00, MutingSensorCommand)
    mutingSensor(_request: MutingSensorCommand): void {}

    /**
     * This command is used for activate sensor's siren for a specific period.
     */
    @command(0x01, SirenActivateCommand)
    sirenActivate(_request: SirenActivateCommand): void {}
}
