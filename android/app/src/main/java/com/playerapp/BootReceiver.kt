package com.playerapp 

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {

        val action = intent.action

        // Listen for BOTH normal boot and "Direct Boot" (faster)
        if (Intent.ACTION_BOOT_COMPLETED == action || 
            Intent.ACTION_LOCKED_BOOT_COMPLETED == action) {
            
            val i = Intent(context, MainActivity::class.java)
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(i)
        }
    }
}